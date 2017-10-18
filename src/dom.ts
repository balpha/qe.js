
    var Scope = QE.Scope;
    var Expression = QE.Expression;

    var globalScope: IPublicScope;
    var MODIFIED_EVENT = "qe:modified-programmatically";
    var EDGE = /Edge/.test(navigator.userAgent);
    
    function build() {
        if (globalScope)
            globalScope.__qe_controller.tearDown();
        globalScope = Scope();
        globalScope.__qe_controller.set("$global", globalScope);
        buildScopes(document.body, globalScope);
    }
    
    function addHover(elem: HTMLElement, scope: IPublicScope) {
        addToggle(elem, scope, "$hover", "*:hover", "mouseenter", "mouseleave");
    }
    function addFocus(elem: HTMLElement, scope: IPublicScope) {
        addToggle(elem, scope, "$focus", "*:focus", "focus", "blur");
    }
    
    function addToggle(elem: HTMLElement, scope: IPublicScope, prop: string, selector: string, trueEvent: string, falseEvent: string) {
        var onTrue: () => void, onFalse: () => void;
        
        var attach = function (setter: ISetter<boolean>) {
            onTrue = function () { setter(true); };
            onFalse = function () { setter(false); };
            elem.addEventListener(trueEvent, onTrue);
            elem.addEventListener(falseEvent, onFalse);
        };
        var detach = function () {
            if (!onTrue)
                return;
            elem.removeEventListener(trueEvent, onTrue);
            elem.removeEventListener(falseEvent, onFalse);
            onTrue = onFalse = null;
        };
        var getCurrentValue = function () {
            var found = elem.parentElement.querySelectorAll(selector);
            //console.log(selector, found);
            for (let i = 0; i < found.length; i++) {
                if (found[i] === elem) {
                    return true;
                }
            }
            return false;
        };
        
        scope.__qe_controller.createDelayed(prop, attach, detach, getCurrentValue);
    }

    function addValue(elem: HTMLInputElement, scope: IPublicScope) {
        var onChange: (e: Event) => void;
        
        var attach = function (setter: ISetter<string | boolean>) {
            onChange = function (evt: Event) {
                if (evt.target !== this) {
                    return;
                }
                var curVal = getCurrenValue();
                setter(curVal);
                if (curVal && elem.type === "radio") {
                    var groupName = elem.name;
                    if (groupName) {
                        let group = document.getElementsByName(groupName);
                        for (let i = 0; i < group.length; i++) {
                            let other = group[i];
                            if (other !== elem && other instanceof HTMLInputElement && other.type === "radio" && other.hasAttribute("qe")) {
                                triggerModifiedEvent(other); // FIXME: move this stuff to the setter wrapper?
                            }
                        }
                    }
                }
            };
            elem.addEventListener("change", onChange);
            elem.addEventListener("input", onChange);
            elem.addEventListener(MODIFIED_EVENT, onChange);
        };
        var detach = function () {
            if (!onChange)
                return;
            elem.removeEventListener("change", onChange);
            elem.removeEventListener("input", onChange);
            elem.removeEventListener(MODIFIED_EVENT, onChange);
            onChange = null;
        };
        var getCurrenValue = function () {
            var type = elem.type;
            if (type === "radio" || type === "checkbox") {
                return elem.checked;
            }
            return elem.value;
            //throw "unsupported element for $value";
        };
        
        scope.__qe_controller.createDelayed("$value", attach, detach, getCurrenValue);
    }
    
    function addAttributes(elem: HTMLElement, scope: IPublicScope) {
        var mo: MutationObserver;
        var attrs: IPublicScope;
        var attach = function (setter: ISetter<IPublicScope>) {
            getCurrentValue();
            mo = new MutationObserver(function (mrs) {
                for (let i = 0; i < mrs.length; i++) {
                    let an = mrs[i].attributeName;
                    let ukan = unKebab(an);
                    if (elem.hasAttribute(an)) {
                        let val = elem.getAttribute(an);
                        attrs.__qe_controller.set(an, val);
                        if (an !== ukan) {
                            attrs.__qe_controller.set(ukan, an);
                        }
                    } else {
                        attrs.__qe_controller.set(an, undefined);
                        if (an !== ukan) {
                            attrs.__qe_controller.set(ukan, undefined);
                        }
                    }
                }
                // note that we're not calling setter
            });
            mo.observe(elem, { attributes: true });
            setter(attrs);
        };
        
        var detach = function () {
            if (mo)
                mo.disconnect();
            if (attrs)
                attrs.__qe_controller.tearDown();
            mo = attrs = null;
        };
        
        var getCurrentValue = function () {
            if (!attrs) {
                attrs = Scope();
                var attributes = elem.attributes;
                for (let i = 0; i < attributes.length; i++) {
                    let name = attributes[i].name;
                    let ukname = unKebab(name);
                    let value = attributes[i].value;
                    
                    attrs.__qe_controller.set(name, value);
                    if (name !== ukname) {
                        attrs.__qe_controller.set(ukname, value);
                    }
                }
            }
            return attrs;
        };
        
        scope.__qe_controller.createDelayed("$attributes", attach, detach, getCurrentValue);
        
    }
    
    var scopes: { [i: number]: IPublicScope } = {};
    
    function getScopeForElement(elem: HTMLElement): IPublicScope {
        return scopes[elem.__qe_scope_id];
    }
    
    function tearDownElementScope(elem: HTMLElement): void {
        var s = getScopeForElement(elem);
        delete scopes[s.__qe_controller._id];
        delete elem.__qe_scope_id;
        s.__qe_controller.tearDown();
    }
    
    function findClosestEntangledAncestor(elem: HTMLElement): HTMLElement {
        if (elem.nodeName === "BODY")
            return null;
        do {
            elem = elem.parentElement as HTMLElement;
        } while (elem.nodeName !== "BODY" && !elem.hasOwnProperty("__qe_scope_id"))
        if (!elem.hasOwnProperty("__qe_scope_id"))
            return null;
        return elem;
    }
    
    function domScope(elem: HTMLElement, parentScope: IPublicScope, name?: string): IPublicScope {
        var scope = Scope(parentScope, name);
        
        addHover(elem, scope);
        addFocus(elem, scope);
        if (elem instanceof HTMLInputElement) {
            addValue(elem, scope);
        }
        addAttributes(elem, scope);
        scope.__qe_controller.set("$element", elem);
        elem.__qe_scope_id = scope.__qe_controller._id;
        scopes[scope.__qe_controller._id] = scope;
        return scope;
    }
    
    function unKebab(s: string): string {
        return s.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
    }

    function kebab(s: string): string {
        return s.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); });
    }
    
    function propertyAttributeValue(s: string): string | number | boolean {
        if (s === "true") {
            return true;
        } else if (s === "false") {
            return false;
        }
        var asNumber = parseFloat(s);
        if (isFinite(asNumber) && "" + asNumber === s) {
            return asNumber;
        }
        return s;
    }
    
    function buildScopes(elem: HTMLElement, parentScope: IPublicScope) {
        var nextParentScope = parentScope;
        if (elem.hasAttribute("qe")) {
            let name = elem.getAttribute("qe") || null;
            let scope = domScope(elem, parentScope, name);
            nextParentScope = scope;
            let attrs = Array.prototype.slice.call(elem.attributes).map(function (a: Attr) { return { name: a.name, value: a.value }; });
            for (let i = 0; i < attrs.length; i++) {
                let attr = attrs[i];
                if (/^qe\./.test(attr.name)) {
                    let prop = unKebab(attr.name.substr(3));
                    scope.__qe_controller.set(prop, propertyAttributeValue(attr.value));
                } else if (/^qe:/.test(attr.name)) {
                    expressionAttribute(scope, elem, attr);
                } else if (attr.name === "qe-tunnel") {
                    let tunnelexprs = attr.value.split(";");
                    for (let j = 0; j < tunnelexprs.length; j++) {
                        let te = tunnelexprs[j].trim();
                        if (/^@/.test(te)) {
                            indirectTunnel(te.substr(1), scope);
                        } else {
                            Tunnel(scope, tunnelexprs[j]);                     
                        }
                        
                    }
                }
            }
        }
        var children = Array.prototype.slice.call(elem.children);
        for (let child of children) if (child instanceof HTMLElement) {
            buildScopes(child, nextParentScope);
        }
    }

    function indirectTunnel(expr: string, scope: IPublicScope) {
        var tunnel: IDestroyable;
        Expression<string>(expr, scope, function (val) {
            if (tunnel) {
                tunnel.destroy();
            }
            if (val) {
                tunnel = Tunnel(scope, val, function () { tunnel = null; });
            }
        });
    }
    
    function expressionAttribute(scope: IPublicScope, elem: HTMLElement, attr: Attr) {
        var actualAttr = attr.name.substr(3);
        if (/^qe(?:\.|:|$)/.test(actualAttr)) {
            throw "I'm sorry Dave, I'm afraid I can't do that."; // technically it works, but I don't see how it would ever be a good idea
        }
        if (actualAttr === "class") {
            expressionAttribute_class(elem, actualAttr, scope, attr.value);
        } else if (actualAttr === "style") {
            if (EDGE) {
                // Under some conditions, setting the style attribute crashes Edge
                // (it happens consistently in the "$value for text inputs..." test).
                // It appears that there's some sort of initialization race, because
                // just *accessing* them element's style property before setting the
                // atribute fixes things.
                elem.style;
            }
            expressionAttribute_style(elem, actualAttr, scope, attr.value);
        } else {
            expressionAttribute_other(elem, actualAttr, scope, attr.value);
        }
    }
    
    function expressionAttribute_class(elem: HTMLElement, actualAttr: string, scope: IPublicScope, expression: string) {
        var added: { [p: string]: boolean } = {},
            removed: { [p: string] : boolean } = {};
        
        Expression(expression, scope, function (val) {
            if (val === false) {
                elem.removeAttribute(actualAttr);
            } else if (typeof val !== "string") {
                if (typeof(val) === "object") {
                    for (let cls in val) if (val.hasOwnProperty(cls)) {
                        if ((val as {[p:string]:any})[cls]) {
                            if (!elem.classList.contains(cls)) {
                                if (!removed[cls])
                                    added[cls] = true;
                                elem.classList.add(cls);
                            }
                        } else {
                            if (elem.classList.contains(cls)) {
                                if (!added[cls])
                                    removed[cls] = true;
                                elem.classList.remove(cls);
                            }
                        }
                    }
                    for (let cls in added) if (added.hasOwnProperty(cls)) {
                        if (!val.hasOwnProperty(cls)) {
                            elem.classList.remove(cls);
                            delete added[cls];
                        }
                    }
                    for (let cls in removed) if (removed.hasOwnProperty(cls)) {
                        if (!val.hasOwnProperty(cls)) {
                            elem.classList.add(cls);
                            delete removed[cls];
                        }
                    }
                }
            } else {
                elem.setAttribute(actualAttr, val);
            }
        });
    }
    
    function expressionAttribute_style(elem: HTMLElement, actualAttr: string, scope: IPublicScope, expression: string) {
        Expression(expression, scope, function (val) {
            if (val === false) {
                elem.removeAttribute(actualAttr);
            } else if (typeof val !== "string") {
                if (typeof(val) === "object") {
                    for (let prop in val) if (val.hasOwnProperty(prop)) {
                        elem.style.setProperty(kebab(prop), (val as IStringDict)[prop]);
                    }
                }
            } else {
                elem.setAttribute(actualAttr, val);
            }
        });
    }
    
    function expressionAttribute_other(elem: HTMLElement, actualAttr: string, scope: IPublicScope, expression: string) {
        Expression(expression, scope, function (val) {
            if (val === false || val === null || val === undefined) { // for class and style, you must use false
                elem.removeAttribute(actualAttr);
            } else {
                elem.setAttribute(actualAttr, "" + val);
            }            
        });
    }
    
    function Tunnel<T>(scope: IPublicScope, definition: string, onDestroy?: () => void) {
        var parts = definition.split(" into ");
        if (parts.length != 2) {
            throw "invalid syntax in tunnel expression " + definition; 
        }
        // FIXME: also check that there's only dot-lookup
        
        var exitAndCondition = parts[1].split(" if ");
        
        if (exitAndCondition.length > 2) {
            throw "invalid syntax in tunnel expression " + definition; 
        }
        
        var tunnelExit = exitAndCondition[0].trim();
        var lastDot = tunnelExit.lastIndexOf(".");
        var tunnelExitScopeExpr: string, tunnelExitProperty: string;
        if (lastDot !== -1) {
            tunnelExitScopeExpr = tunnelExit.substr(0, lastDot);
        } else {
            tunnelExitScopeExpr = "$self"; 
        }
        tunnelExitProperty = tunnelExit.substr(lastDot + 1);
        var tunnelEntrance = parts[0];
        var tunnelCondition = exitAndCondition[1];
        
        var tunnelExitScope: IPublicScope;
        var tunnelValue: T;
        var tunnelActive = !tunnelCondition;
        var token: number;
        var expressions: IDestroyable[] = [];
        var doTunnel = function () {
            if (tunnelExitScope) {
                if (tunnelActive) {
                    token = tunnelExitScope.__qe_controller.multiSet(tunnelExitProperty, tunnelValue, token);
                } else if (token) {
                    tunnelExitScope.__qe_controller.unMultiSet(tunnelExitProperty, token);
                    token = null;
                }
            }
        };
        expressions.push(Expression<IPublicScope>(tunnelExitScopeExpr, scope, function (s) {
            if (tunnelActive && tunnelExitScope) {
                tunnelActive = false;
                doTunnel();
                tunnelActive = true;
            }
            tunnelExitScope = s;
            doTunnel();
        }, destroy));

        if (tunnelCondition) {
            expressions.push(Expression(tunnelCondition, scope, function(v) {
                tunnelActive = !!v;
                doTunnel();
            }, destroy));
        }
        
        expressions.push(Expression<T>(tunnelEntrance, scope, function (v) {
            tunnelValue = v;
            doTunnel();
        }, destroy));
        
        function destroy() {
            if (!expressions) { // already destroyed
                return;
            }
            var oldExpressions = expressions;
            expressions = null;
            tunnelActive=false;
            doTunnel();
            for (let e of oldExpressions) {
                e.destroy();
            }
            
        }
        
        if (onDestroy) {
            return {
                destroy: destroy
            };
        }
        
    }
    
    function anyNodeIsQe(nodeList: NodeList) {
        for (let i = 0; i<nodeList.length; i++) {
            let node = nodeList[i];
            if (node.nodeType !== Node.ELEMENT_NODE)
                continue;
            if (!(node instanceof HTMLElement))
                continue;
            if (node.hasAttribute("qe"))
                return true;
            if (node.querySelector("*[qe]"))
                return true;
        }
        return false;
    }
    
    function triggerModifiedEvent(elem: HTMLElement) {
        // FIXME: use the modern version, only fall back to the old IE-compatible way of creating events
        var evt = document.createEvent("Event");
        evt.initEvent(MODIFIED_EVENT, false, true); // don't bubble
        elem.dispatchEvent(evt);        
    }
    
    function triggerModifiedEventOnPropertyChange(nodeName: string, propertyName: string) {
    
        var inp = document.createElement(nodeName);
    
        // walk up its prototype chain until we find the object on which .value is defined
        var valuePropObj = Object.getPrototypeOf(inp);
        var descriptor;
        while (valuePropObj && !descriptor) {
             descriptor = Object.getOwnPropertyDescriptor(valuePropObj, propertyName);
             if (!descriptor)
                valuePropObj = Object.getPrototypeOf(valuePropObj);
        }
    
        if (!descriptor) {
            console.log("couldn't find ." + propertyName + " anywhere in the prototype chain :(");
            return;
        }
    
        // remember the original .value setter ...
        var oldSetter = descriptor.set;
    
        // ... and replace it with a new one that a) calls the original,
        // and b) triggers a custom event
        descriptor.set = function () {
            oldSetter.apply(this, arguments);
            //console.log(propertyName,"on",this,"modified");
            triggerModifiedEvent(this);
        };
    
        // re-apply the modified descriptor
        Object.defineProperty(valuePropObj, propertyName, descriptor);
    }    
    
    function monkeypatchInputs() {
        var props = ["value", "checked", "defaultValue", "defaultChecked"];
        for (let i = 0; i < props.length; i++) {
            triggerModifiedEventOnPropertyChange("input", props[i]);
        }
        
    }
    
    function elementHasEntangledDescendants(elem: Element) {
        for (var i=0; i<elem.children.length; i++) {
            var child = elem.children[i];
            if (child.hasOwnProperty("__qe_scope_id"))
                return true;
            if (elementHasEntangledDescendants(child))
                return true;
        }
        return false;
    }
    
    QE.init = function() {
        var mo = new MutationObserver(function (mrs) {
            for (let i = 0; i < mrs.length; i++) {
                let mr = mrs[i];
                let elem = mr.target as HTMLElement;
                if (mr.type === "attributes" && /^qe(?:-tunnel$|\.|:|$)/.test(mr.attributeName) && mr.oldValue !== elem.getAttribute(mr.attributeName)) {
                    if (/^qe\./.test(mr.attributeName)) {
                        let prop = unKebab(mr.attributeName.substr(3));
                        getScopeForElement(elem).__qe_controller.set(prop, elem.hasAttribute(mr.attributeName) ? propertyAttributeValue(elem.getAttribute(mr.attributeName)) : undefined);
                        continue;
                    }
                    let closest = findClosestEntangledAncestor(elem);
                    if (closest) {
                        if (elementHasEntangledDescendants(elem)) {
                            let grandParent = (getScopeForElement(closest) as any).$parent as IPublicScope;
                            tearDownElementScope(closest);
                            buildScopes(closest, grandParent);
                        } else {
                            let old = getScopeForElement(elem);
                            if (old) {
                                tearDownElementScope(elem);
                            }
                            buildScopes(elem, getScopeForElement(closest));                            
                        }
                    } else {
                        let old = getScopeForElement(elem);
                        if (old) {
                            tearDownElementScope(elem);
                            buildScopes(elem, globalScope);
                        } else {
                            build();
                            return;
                        }
                        
                    }
                    continue;
                }
                if (anyNodeIsQe(mr.addedNodes) || anyNodeIsQe(mr.removedNodes)) {
                    build();
                    return;
                }
                
            }
            
        });
        mo.observe(document.body, {
            attributes: true,
            childList: true,
            subtree: true,
            attributeOldValue: true
        });
        monkeypatchInputs();
        build();
    }
