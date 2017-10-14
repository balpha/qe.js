namespace QE {

    var globalScope: IPublicScope;
    var MODIFIED_EVENT = "qe:modified-programmatically";
    var EDGE = /Edge/.test(navigator.userAgent);
    
    function build() {
        if (globalScope)
            globalScope.tearDown();
        globalScope = Scope();
        globalScope.set("$global", globalScope);
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
            for (var i = 0; i < found.length; i++) {
                if (found[i] === elem) {
                    return true;
                }
            }
            return false;
        };
        
        scope.createDelayed(prop, attach, detach, getCurrentValue);
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
                        var group = document.getElementsByName(groupName);
                        for (var i = 0; i < group.length; i++) {
                            var other = group[i];
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
        
        scope.createDelayed("$value", attach, detach, getCurrenValue);
    }
    
    function addAttributes(elem: HTMLElement, scope: IPublicScope) {
        var mo: MutationObserver;
        var attrs: IPublicScope;
        var attach = function (setter: ISetter<IPublicScope>) {
            getCurrentValue();
            mo = new MutationObserver(function (mrs) {
                for (var i = 0; i < mrs.length; i++) {
                    var an = mrs[i].attributeName;
                    var ukan = unKebab(an);
                    if (elem.hasAttribute(an)) {
                        var val = elem.getAttribute(an);
                        attrs.set(an, val);
                        if (an !== ukan) {
                            attrs.set(ukan, an);
                        }
                    } else {
                        attrs.set(an, undefined);
                        if (an !== ukan) {
                            attrs.set(ukan, undefined);
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
                attrs.tearDown();
            mo = attrs = null;
        };
        
        var getCurrentValue = function () {
            if (!attrs) {
                attrs = Scope();
                var attributes = elem.attributes;
                for (var i = 0; i < attributes.length; i++) {
                    var name = attributes[i].name;
                    var ukname = unKebab(name);
                    var value = attributes[i].value;
                    
                    attrs.set(name, value);
                    if (name !== ukname) {
                        attrs.set(ukname, value);
                    }
                }
            }
            return attrs;
        };
        
        scope.createDelayed("$attributes", attach, detach, getCurrentValue);
        
    }
    
    function domScope(elem: HTMLElement, parentScope: IPublicScope, name?: string): IPublicScope {
        var scope = Scope(parentScope, name);
        
        addHover(elem, scope);
        addFocus(elem, scope);
        if (elem instanceof HTMLInputElement) {
            addValue(elem, scope);
        }
        addAttributes(elem, scope);
        scope.set("$element", elem);
        
        return scope;
    }
    
    function unKebab(s: string): string {
        return s.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
    }

    function kebab(s: string): string {
        return s.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); });
    }
    
    function buildScopes(elem: HTMLElement, parentScope: IPublicScope) {
        var nextParentScope = parentScope;
        if (elem.hasAttribute("qe")) {
            var name = elem.getAttribute("qe") || null;
            var scope = domScope(elem, parentScope, name);
            nextParentScope = scope;
            var attrs = Array.prototype.slice.call(elem.attributes).map(function (a: Attr) { return { name: a.name, value: a.value }; });
            for (var i = 0; i < attrs.length; i++) {
                var attr = attrs[i];
                if (/^qe\./.test(attr.name)) {
                    var prop = unKebab(attr.name.substr(3));
                    scope.set(prop, attr.value);
                } else if (/^qe:/.test(attr.name)) {
                    expressionAttribute(scope, elem, attr);
                } else if (attr.name === "qe-tunnel") {
                    var tunnelexprs = attr.value.split(";");
                    for (var j = 0; j < tunnelexprs.length; j++) {
                        var te = tunnelexprs[j].trim();
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
        for (var child of children) if (child instanceof HTMLElement) {
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
        Expression(attr.value, scope, function (val) {
            if (val === false) {
                elem.removeAttribute(actualAttr);
            } else if (actualAttr === "class" && typeof val !== "string") {
                if (typeof(val) === "object") {
                    for (var cls in val) if (val.hasOwnProperty(cls)) {
                        if ((val as IStringDict)[cls]) {
                            elem.classList.add(cls);
                        } else {
                            elem.classList.remove(cls);
                        }
                    }
                }
            } else if (actualAttr === "style" && typeof val !== "string") {
                if (typeof(val) === "object") {
                    for (var prop in val) if (val.hasOwnProperty(prop)) {
                        elem.style.setProperty(kebab(prop), (val as IStringDict)[prop]);
                    }
                }
            } else if (val === null || val === undefined) { // for class and style, you must use false
                elem.removeAttribute(actualAttr);
            } else {
                if (EDGE && actualAttr === "style") {
                    // Under some conditions, setting the style attribute crashes Edge
                    // (it happens consistently in the "$value for text inputs..." test).
                    // It appears that there's some sort of initialization race, because
                    // just *accessing* them element's style property before setting the
                    // atribute fixes things.
                    elem.style;
                }
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
                    token = tunnelExitScope.multiSet(tunnelExitProperty, tunnelValue, token);
                } else if (token) {
                    tunnelExitScope.unMultiSet(tunnelExitProperty, token);
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
            for (var e of oldExpressions) {
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
        for (var i = 0; i<nodeList.length; i++) {
            var node = nodeList[i];
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
        for (var i = 0; i < props.length; i++) {
            triggerModifiedEventOnPropertyChange("input", props[i]);
        }
        
    }
    
    export function init() {
        var mo = new MutationObserver(function (mrs) {
            for (var i = 0; i < mrs.length; i++) {
                var mr = mrs[i];
                
                if (mr.type === "attributes" && /^qe/.test(mr.attributeName) && mr.oldValue !== (mr.target as HTMLElement).getAttribute(mr.attributeName)) {
                    build();
                    return;
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
}