var QE;
(function (QE) {
    var nextId = 1;
    var scopes = {};
    var ScopePrivate = (function () {
        function ScopePrivate(parent, name) {
            this._data = {};
            this._children = [];
            this._parent = parent;
            this._dependents = {};
            this._id = nextId;
            this._delayedProps = {};
            this._name = name;
            this._valueStacks = {};
            nextId++;
            scopes[this._id] = this;
            if (parent) {
                this._publicScope = Object.create(parent._publicScope);
                this._parent.childAdded(this);
            }
            else {
                this._publicScope = Object.create(Object);
            }
            this._publicScope.__qe_controller = {};
            Object.defineProperty(this._publicScope.__qe_controller, "_id", {
                value: this._id
            });
            var that = this;
            this._publicScope.__qe_controller.set = function (name, value) {
                this.multiSet(name, value, 0);
            };
            this._publicScope.__qe_controller.multiSet = function (name, value, token) {
                var stack = that._valueStacks[name];
                if (!stack) {
                    stack = that._valueStacks[name] = [];
                    stack.length = 1;
                }
                if (typeof token !== "number") {
                    for (var i = 1; i <= stack.length; i++) {
                        if (!(i in stack)) {
                            token = i;
                            break;
                        }
                    }
                }
                stack[token] = value;
                that.applyValueStack(name);
                return token;
            };
            this._publicScope.__qe_controller.unMultiSet = function (name, token) {
                var stack = that._valueStacks[name];
                delete stack[token];
                that.applyValueStack(name);
            };
            this._publicScope.__qe_controller.createDelayed = function (name, attach, detach, getCurrentValue) {
                that.set(name, {
                    attach: attach,
                    detach: detach,
                    getCurrentValue: getCurrentValue
                }, "create");
            };
            this._publicScope.__qe_controller.set("$self", this._publicScope);
            this._publicScope.__qe_controller.set("$parent", Object.getPrototypeOf(this._publicScope));
            if (parent && parent._name) {
                this._publicScope.__qe_controller.set(parent._name, Object.getPrototypeOf(this._publicScope));
            }
            this._publicScope.__qe_controller.tearDown = function () {
                that.tearDown();
            };
        }
        ScopePrivate.prototype.set = function (name, val, delayed) {
            if (this._tearingDown) {
                throw "scope is tearing down, cannot set";
            }
            var oldVal = null;
            var that = this;
            var shadowing = false;
            var attached = false;
            if (!this._publicScope.hasOwnProperty(name)) {
                shadowing = name in this._publicScope;
                if (delayed === "create") {
                    this._delayedProps[name] = val;
                }
                else if (delayed === "set") {
                    throw name + " is not a delayed property";
                }
                Object.defineProperty(this._publicScope, name, {
                    get: function () {
                        if (delayed === "create" && !attached) {
                            attached = true;
                            val.attach(function (v) {
                                that.set(name, v, "set");
                            });
                            that._data[name] = val.getCurrentValue();
                        }
                        var result = that._data[name];
                        that.notifyAccessed(name, getPrivateScopeFor(result));
                        return result;
                    }
                });
            }
            else {
                if (this._delayedProps[name] && delayed !== "set") {
                    throw "attempting to modify existing delayed property " + name;
                }
                oldVal = this._data[name];
                if (val === oldVal) {
                    return;
                }
            }
            this._data[name] = val;
            this.notifyChanged(name);
            if (shadowing) {
                this.notifyShadowing(name);
            }
        };
        ScopePrivate.prototype.applyValueStack = function (name) {
            var stack = this._valueStacks[name];
            if (!stack)
                return;
            var any = false;
            for (var i = stack.length - 1; i >= 0; i--) {
                if (i in stack) {
                    any = true;
                    this.set(name, stack[i]);
                    break;
                }
            }
            if (!any) {
                this.set(name, undefined);
            }
        };
        ScopePrivate.prototype.notifyChanged = function (name) {
            if (this._tearingDown)
                return;
            var deps = this._dependents[name];
            if (deps) {
                deps = deps.slice();
                for (var i = 0; i < deps.length; i++) {
                    deps[i]();
                }
            }
            this.notifySomethingChanged();
        };
        ScopePrivate.prototype.notifySomethingChanged = function () {
            if (this._tearingDown)
                return;
            var deps = this._dependents["$$anything"];
            if (deps) {
                deps = deps.slice();
                for (var i = 0; i < deps.length; i++) {
                    deps[i]();
                }
            }
            for (var i = 0; i < this._children.length; i++) {
                this._children[i].notifySomethingChanged();
            }
        };
        ScopePrivate.prototype.on = function (name, cb) {
            if (this._tearingDown)
                throw "tearing down, cannot subscribe";
            if (!name) {
                name = "$$anything";
            }
            var deps = this._dependents[name];
            if (!deps) {
                deps = this._dependents[name] = [];
            }
            if (deps.indexOf(cb) < 0) {
                deps.push(cb);
            }
        };
        ;
        ScopePrivate.prototype.off = function (name, cb) {
            if (this._tearingDown)
                return;
            if (!name) {
                name = "$$anything";
            }
            var deps = this._dependents[name];
            var i = deps.indexOf(cb);
            if (i >= 0)
                deps.splice(i, 1);
        };
        ;
        ScopePrivate.prototype.tearingDown = function () {
            this._tearingDown = true;
            for (var i = 0; i < this._children.length; i++) {
                this._children[i].tearingDown();
            }
        };
        ScopePrivate.prototype.tearDown = function () {
            if (!this._tearingDown)
                this.tearingDown();
            var data = this._data;
            this._data = {};
            if (this._parent) {
                Object.setPrototypeOf(this._publicScope, Object.prototype);
                var parent_1 = this._parent;
                this._parent = null;
                parent_1.childRemoved(this);
            }
            var children = this._children.slice();
            for (var i = 0; i < children.length; i++) {
                children[i].tearDown();
            }
            for (var key in this._dependents)
                if (this._dependents.hasOwnProperty(key)) {
                    var val = data[key];
                    var deps = this._dependents[key];
                    for (var i = 0; i < deps.length; i++) {
                        deps[i]();
                    }
                }
            this._dependents = null;
            for (var key in this._delayedProps)
                if (this._delayedProps.hasOwnProperty(key)) {
                    this._delayedProps[key].detach();
                }
            this._delayedProps = null;
            this._valueStacks = null;
            delete scopes[this._id];
        };
        ScopePrivate.prototype.notifyAccessed = function (name, valueIsScope) {
            if (this._tearingDown)
                return;
            if (accessStack.length) {
                accessStack[accessStack.length - 1].push([this, name, valueIsScope]);
            }
        };
        ScopePrivate.prototype.notifyShadowing = function (name) {
            var s = this._parent;
            while (!s._publicScope.hasOwnProperty(name)) {
                s = s._parent;
            }
            s.beingShadowed(name);
        };
        ScopePrivate.prototype.childAdded = function (scope) {
            this._children.push(scope);
        };
        ScopePrivate.prototype.childRemoved = function (scope) {
            this._children.splice(this._children.indexOf(scope), 1);
        };
        ScopePrivate.prototype.beingShadowed = function (name) {
            this.notifyChanged(name);
        };
        return ScopePrivate;
    }());
    var accessStack = [];
    function recordAccess() {
        accessStack.push([]);
    }
    function endRecordAccess() {
        return accessStack.pop();
    }
    function getPrivateScopeFor(publicScope) {
        if (!(publicScope && publicScope.__qe_controller))
            return null;
        var s = scopes[publicScope.__qe_controller._id];
        if (s._publicScope === publicScope)
            return s;
        return null;
    }
    var nextExpressionId = 1;
    var exceptions = {};
    var exceptionLogTimeout;
    var exceptionLoggers = [];
    var doLogExceptionsToConsole = true;
    exceptionLoggers.push(function (expression, exception) {
        if (doLogExceptionsToConsole && window.console && console.error) {
            console.error("Expression `" + expression + "` threw " + exception.constructor.name + ": " + exception.message + ", treating as undefined\n", exception);
        }
    });
    function logException(exception, expressionId, expression) {
        exceptions[expressionId] = [expression, exception];
        if (!exceptionLogTimeout) {
            exceptionLogTimeout = setTimeout(outputLog, 0);
        }
    }
    function noException(expressionId) {
        delete exceptions[expressionId];
    }
    function outputLog() {
        for (var i in exceptions)
            if (exceptions.hasOwnProperty(i)) {
                for (var _i = 0, exceptionLoggers_1 = exceptionLoggers; _i < exceptionLoggers_1.length; _i++) {
                    var handler = exceptionLoggers_1[_i];
                    handler.apply(null, exceptions[i]);
                }
            }
        exceptions = {};
        exceptionLogTimeout = null;
    }
    function onException(f) {
        exceptionLoggers.push(f);
    }
    QE.onException = onException;
    function logPendingExceptions() {
        if (exceptionLogTimeout) {
            clearTimeout(exceptionLogTimeout);
            outputLog();
        }
    }
    QE.logPendingExceptions = logPendingExceptions;
    function logExceptionsToConsole(yesno) {
        doLogExceptionsToConsole = yesno;
    }
    QE.logExceptionsToConsole = logExceptionsToConsole;
    function ExpressionPrivate(exp, scope, callback, onDestroy) {
        var id = nextExpressionId;
        nextExpressionId++;
        var func = new Function("scope", "with(scope){return " + exp + "}");
        var value;
        var destroying = false;
        var onChange = function () {
            if (scope._tearingDown || destroying) {
                var deps = myDependencies;
                myDependencies = null;
                if (deps)
                    for (var i = 0; i < deps.length; i++) {
                        var dep = deps[i];
                        dep[0].off(dep[1], onChange);
                    }
                value = undefined;
                if (onDestroy)
                    onDestroy();
                return;
            }
            evaluate();
        };
        onChange.displayName = "onChange[" + exp + "]";
        var myDependencies;
        var initial = true;
        var evalutating = false;
        evaluate();
        initial = false;
        if (onDestroy) {
            return {
                destroy: function () {
                    if (destroying)
                        return;
                    destroying = true;
                    onChange();
                }
            };
        }
        function evaluate() {
            if (evalutating) {
                return;
            }
            evalutating = true;
            recordAccess();
            var newValue;
            var threw = false;
            try {
                newValue = func(scope._publicScope);
            }
            catch (ex) {
                logException(ex, id, exp);
                threw = true;
                newValue = undefined;
            }
            if (!threw) {
                noException(id);
            }
            var newDependencies = endRecordAccess();
            if (threw || true) {
                newDependencies.push([scope, null]);
            }
            if (myDependencies)
                for (var i = 0; i < myDependencies.length; i++) {
                    var dep = myDependencies[i];
                    dep[0].off(dep[1], onChange);
                }
            myDependencies = newDependencies;
            var scopeValued = [];
            if (myDependencies)
                for (var i = 0; i < myDependencies.length; i++) {
                    var dep = myDependencies[i];
                    dep[0].on(dep[1], onChange);
                    if (dep[2]) {
                        scopeValued.push([dep[2], null]);
                        dep[2].on(null, onChange);
                    }
                }
            if (scopeValued.length) {
                myDependencies = myDependencies.concat(scopeValued);
            }
            if (initial || value !== newValue) {
                callback(newValue);
                value = newValue;
            }
            evalutating = false;
        }
    }
    function Scope(parent, name) {
        var privateParent = null;
        if (parent) {
            privateParent = getPrivateScopeFor(parent);
        }
        var newScope = new ScopePrivate(privateParent, name);
        return newScope._publicScope;
    }
    QE.Scope = Scope;
    function Expression(exp, scope, callback, onDestroy) {
        return ExpressionPrivate(exp, getPrivateScopeFor(scope), callback, onDestroy);
    }
    QE.Expression = Expression;
})(QE || (QE = {}));
var QE;
(function (QE) {
    var Scope = QE.Scope;
    var Expression = QE.Expression;
    var globalScope;
    var MODIFIED_EVENT = "qe:modified-programmatically";
    var EDGE = /Edge/.test(navigator.userAgent);
    function build() {
        if (globalScope)
            globalScope.__qe_controller.tearDown();
        globalScope = Scope();
        globalScope.__qe_controller.set("$global", globalScope);
        buildScopes(document.body, globalScope);
    }
    function addHover(elem, scope) {
        addToggle(elem, scope, "$hover", "*:hover", "mouseenter", "mouseleave");
    }
    function addFocus(elem, scope) {
        addToggle(elem, scope, "$focus", "*:focus", "focus", "blur");
    }
    function addToggle(elem, scope, prop, selector, trueEvent, falseEvent) {
        var onTrue, onFalse;
        var attach = function (setter) {
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
            for (var i = 0; i < found.length; i++) {
                if (found[i] === elem) {
                    return true;
                }
            }
            return false;
        };
        scope.__qe_controller.createDelayed(prop, attach, detach, getCurrentValue);
    }
    function addValue(elem, scope) {
        var onChange;
        var attach = function (setter) {
            onChange = function (evt) {
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
                                triggerModifiedEvent(other);
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
        };
        scope.__qe_controller.createDelayed("$value", attach, detach, getCurrenValue);
    }
    function addAttributes(elem, scope) {
        var mo;
        var attrs;
        var attach = function (setter) {
            getCurrentValue();
            mo = new MutationObserver(function (mrs) {
                for (var i = 0; i < mrs.length; i++) {
                    var an = mrs[i].attributeName;
                    var ukan = unKebab(an);
                    if (elem.hasAttribute(an)) {
                        var val = elem.getAttribute(an);
                        attrs.__qe_controller.set(an, val);
                        if (an !== ukan) {
                            attrs.__qe_controller.set(ukan, an);
                        }
                    }
                    else {
                        attrs.__qe_controller.set(an, undefined);
                        if (an !== ukan) {
                            attrs.__qe_controller.set(ukan, undefined);
                        }
                    }
                }
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
                for (var i = 0; i < attributes.length; i++) {
                    var name_1 = attributes[i].name;
                    var ukname = unKebab(name_1);
                    var value = attributes[i].value;
                    attrs.__qe_controller.set(name_1, value);
                    if (name_1 !== ukname) {
                        attrs.__qe_controller.set(ukname, value);
                    }
                }
            }
            return attrs;
        };
        scope.__qe_controller.createDelayed("$attributes", attach, detach, getCurrentValue);
    }
    function domScope(elem, parentScope, name) {
        var scope = Scope(parentScope, name);
        addHover(elem, scope);
        addFocus(elem, scope);
        if (elem instanceof HTMLInputElement) {
            addValue(elem, scope);
        }
        addAttributes(elem, scope);
        scope.__qe_controller.set("$element", elem);
        return scope;
    }
    function unKebab(s) {
        return s.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
    }
    function kebab(s) {
        return s.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); });
    }
    function buildScopes(elem, parentScope) {
        var nextParentScope = parentScope;
        if (elem.hasAttribute("qe")) {
            var name_2 = elem.getAttribute("qe") || null;
            var scope = domScope(elem, parentScope, name_2);
            nextParentScope = scope;
            var attrs = Array.prototype.slice.call(elem.attributes).map(function (a) { return { name: a.name, value: a.value }; });
            for (var i = 0; i < attrs.length; i++) {
                var attr = attrs[i];
                if (/^qe\./.test(attr.name)) {
                    var prop = unKebab(attr.name.substr(3));
                    scope.__qe_controller.set(prop, attr.value);
                }
                else if (/^qe:/.test(attr.name)) {
                    expressionAttribute(scope, elem, attr);
                }
                else if (attr.name === "qe-tunnel") {
                    var tunnelexprs = attr.value.split(";");
                    for (var j = 0; j < tunnelexprs.length; j++) {
                        var te = tunnelexprs[j].trim();
                        if (/^@/.test(te)) {
                            indirectTunnel(te.substr(1), scope);
                        }
                        else {
                            Tunnel(scope, tunnelexprs[j]);
                        }
                    }
                }
            }
        }
        var children = Array.prototype.slice.call(elem.children);
        for (var _i = 0, children_1 = children; _i < children_1.length; _i++) {
            var child = children_1[_i];
            if (child instanceof HTMLElement) {
                buildScopes(child, nextParentScope);
            }
        }
    }
    function indirectTunnel(expr, scope) {
        var tunnel;
        Expression(expr, scope, function (val) {
            if (tunnel) {
                tunnel.destroy();
            }
            if (val) {
                tunnel = Tunnel(scope, val, function () { tunnel = null; });
            }
        });
    }
    function expressionAttribute(scope, elem, attr) {
        var actualAttr = attr.name.substr(3);
        if (/^qe(?:\.|:|$)/.test(actualAttr)) {
            throw "I'm sorry Dave, I'm afraid I can't do that.";
        }
        Expression(attr.value, scope, function (val) {
            if (EDGE && actualAttr === "style") {
                elem.style;
            }
            if (val === false) {
                elem.removeAttribute(actualAttr);
            }
            else if (actualAttr === "class" && typeof val !== "string") {
                if (typeof (val) === "object") {
                    for (var cls in val)
                        if (val.hasOwnProperty(cls)) {
                            if (val[cls]) {
                                elem.classList.add(cls);
                            }
                            else {
                                elem.classList.remove(cls);
                            }
                        }
                }
            }
            else if (actualAttr === "style" && typeof val !== "string") {
                if (typeof (val) === "object") {
                    for (var prop in val)
                        if (val.hasOwnProperty(prop)) {
                            elem.style.setProperty(kebab(prop), val[prop]);
                        }
                }
            }
            else if (val === null || val === undefined) {
                elem.removeAttribute(actualAttr);
            }
            else {
                elem.setAttribute(actualAttr, "" + val);
            }
        });
    }
    function Tunnel(scope, definition, onDestroy) {
        var parts = definition.split(" into ");
        if (parts.length != 2) {
            throw "invalid syntax in tunnel expression " + definition;
        }
        var exitAndCondition = parts[1].split(" if ");
        if (exitAndCondition.length > 2) {
            throw "invalid syntax in tunnel expression " + definition;
        }
        var tunnelExit = exitAndCondition[0].trim();
        var lastDot = tunnelExit.lastIndexOf(".");
        var tunnelExitScopeExpr, tunnelExitProperty;
        if (lastDot !== -1) {
            tunnelExitScopeExpr = tunnelExit.substr(0, lastDot);
        }
        else {
            tunnelExitScopeExpr = "$self";
        }
        tunnelExitProperty = tunnelExit.substr(lastDot + 1);
        var tunnelEntrance = parts[0];
        var tunnelCondition = exitAndCondition[1];
        var tunnelExitScope;
        var tunnelValue;
        var tunnelActive = !tunnelCondition;
        var token;
        var expressions = [];
        var doTunnel = function () {
            if (tunnelExitScope) {
                if (tunnelActive) {
                    token = tunnelExitScope.__qe_controller.multiSet(tunnelExitProperty, tunnelValue, token);
                }
                else if (token) {
                    tunnelExitScope.__qe_controller.unMultiSet(tunnelExitProperty, token);
                    token = null;
                }
            }
        };
        expressions.push(Expression(tunnelExitScopeExpr, scope, function (s) {
            if (tunnelActive && tunnelExitScope) {
                tunnelActive = false;
                doTunnel();
                tunnelActive = true;
            }
            tunnelExitScope = s;
            doTunnel();
        }, destroy));
        if (tunnelCondition) {
            expressions.push(Expression(tunnelCondition, scope, function (v) {
                tunnelActive = !!v;
                doTunnel();
            }, destroy));
        }
        expressions.push(Expression(tunnelEntrance, scope, function (v) {
            tunnelValue = v;
            doTunnel();
        }, destroy));
        function destroy() {
            if (!expressions) {
                return;
            }
            var oldExpressions = expressions;
            expressions = null;
            for (var _i = 0, oldExpressions_1 = oldExpressions; _i < oldExpressions_1.length; _i++) {
                var e = oldExpressions_1[_i];
                e.destroy();
            }
        }
        if (onDestroy) {
            return {
                destroy: destroy
            };
        }
    }
    function anyNodeIsQe(nodeList) {
        for (var i = 0; i < nodeList.length; i++) {
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
    function triggerModifiedEvent(elem) {
        var evt = document.createEvent("Event");
        evt.initEvent(MODIFIED_EVENT, false, true);
        elem.dispatchEvent(evt);
    }
    function triggerModifiedEventOnPropertyChange(nodeName, propertyName) {
        var inp = document.createElement(nodeName);
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
        var oldSetter = descriptor.set;
        descriptor.set = function () {
            oldSetter.apply(this, arguments);
            triggerModifiedEvent(this);
        };
        Object.defineProperty(valuePropObj, propertyName, descriptor);
    }
    function monkeypatchInputs() {
        var props = ["value", "checked", "defaultValue", "defaultChecked"];
        for (var i = 0; i < props.length; i++) {
            triggerModifiedEventOnPropertyChange("input", props[i]);
        }
    }
    function init() {
        var mo = new MutationObserver(function (mrs) {
            for (var i = 0; i < mrs.length; i++) {
                var mr = mrs[i];
                if (mr.type === "attributes" && /^qe/.test(mr.attributeName) && mr.oldValue !== mr.target.getAttribute(mr.attributeName)) {
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
    QE.init = init;
})(QE || (QE = {}));
