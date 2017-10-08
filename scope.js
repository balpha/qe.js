(function () {
    
    var nextId = 1;
    var scopes = {};
    
    function ScopePrivate(parent, name) {
        
        this._data = {};
        this._children = [];
        this._parent = parent;
        this._dependents = {}; // keys are property names
        this._id = nextId;
        this._delayedProps = {};
        this._name = name;
        this._valueStacks = {};
        nextId++;
        scopes[this._id] = this;
        if (parent) {
            this._publicScope = Object.create(parent._publicScope);
            this._parent.childAdded(this);
        } else {
            this._publicScope = Object.create(Object);
        }
        Object.defineProperty(this._publicScope, "_id", {
            value: this._id
        });
        var that = this;
        this._publicScope.set = function(name, value) {
            this.multiSet(name, value, 0);
        };
        this._publicScope.multiSet = function(name, value, token) { // token is optional
            var stack = that._valueStacks[name];
            if (!stack) {
                stack = that._valueStacks[name] = [];
                stack.length = 1;
            }
            if (typeof token !== "number") {
                for (var i = 1; i <= stack.length; i++) { // note  "1" and "<=", both intentional
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
        this._publicScope.unMultiSet = function (name, token) {
            var stack = that._valueStacks[name];
            delete stack[token];
            that.applyValueStack(name);
        };
        this._publicScope.createDelayed = function (name, attach, detach, getCurrentValue) {
            that.set(name, {
                attach: attach,
                detach: detach,
                getCurrentValue: getCurrentValue
            }, "create");
        };
        this._publicScope.set("$$self", this._publicScope);
        this._publicScope.set("$$parent", Object.getPrototypeOf(this._publicScope));
        if (parent && parent._name) {
            this._publicScope.set(parent._name, Object.getPrototypeOf(this._publicScope));
        }
        this._publicScope.tearDown = function () {
            that.tearDown();
        };
    }
    
    ScopePrivate.prototype = {};
    /* if delayed=="create", then val is an object with these properties:
     * - attach(setter) -- returns the current value
     * - detach()
     * - getCurrentValue()
     * if there is already a delayed property, delayed must be "set" to allow
     * */
    ScopePrivate.prototype.set = function (name, val, delayed) {
        if (this._tearingDown) {
            throw "scope is tearing down, cannot set";
        }
        
        var oldVal = null;
        var that = this;
        var shadowing = false;
        var attached = false; // only interesting for delayed
        if (!this._publicScope.hasOwnProperty(name)) {
            shadowing = name in this._publicScope;
            
            if (delayed === "create") {
                this._delayedProps[name] = val;
            } else if (delayed === "set") {
                throw name + " is not a delayed property";
            }
            
            Object.defineProperty(this._publicScope, name, {
                get: function () {
                    if (delayed === "create" && !attached) {
                        attached = true;
                        //console.log("attaching ", name, "in", that);
                        val.attach(function (v) {
                            that.set(name, v, "set");
                        });
                        that._data[name] = val.getCurrentValue();
                    }
                    that.notifyAccessed(name);
                    return that._data[name];
                }
            });
           
        } else {
            if (this._delayedProps[name] && delayed !== "set") {
                throw "attempting to modify existing delayed property " + name;
            }
            oldVal = this._data[name];
            if (val === oldVal) {
                return;
            }
        }
        this._data[name] = val;
        this.notifyChanged(name, delayed === "create" ? val.getCurrentValue : val, oldVal, delayed === "create");
        if (shadowing) {
            this.notifyShadowing(name);
        }
        return;
    };
    
    ScopePrivate.prototype.applyValueStack = function (name) {
        var stack = this._valueStacks[name];
        if (!stack)
            return;
        var any = false;
        for (var i = stack.length-1; i >= 0; i--) { // walk backwards -- non-defaults (i.e. tunnels) win
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
    
    ScopePrivate.prototype.notifyChanged = function(name, newVal, oldVal, newValIsGetter) {
        //console.log(name,"in",this,"changed from",oldVal,"to",newVal);
        
        if (this._tearingDown)
            return;
        
        var deps = this._dependents[name];
        if (deps) {
            if (newValIsGetter) {
                newVal = newVal();
            }
            deps = deps.slice();
            for (var i = 0; i < deps.length; i++) {
                deps[i](this, name, newVal, oldVal);
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
                deps[i](this);
            }
        }
        for (var i = 0; i < this._children.length; i++) {
            this._children[i].notifySomethingChanged();
        }   
    }
    
    ScopePrivate.prototype.on = function(name, cb) {
        if (this._tearingDown)
            throw "tearing down, cannot subscribe";
        if (!name) {
            name = "$$anything";            
        }
        var deps = this._dependents[name];
        if (!deps) {
            deps = this._dependents[name] = [];
        }
        deps.push(cb);
    };
    ScopePrivate.prototype.off = function (name, cb) {
        if (this._tearingDown)
            return;
        if (!name) {
            name = "$$anything";            
        }
        var deps = this._dependents[name];
        var i = deps.indexOf(cb);
        deps.splice(i, 1);
    };
    ScopePrivate.prototype.tearingDown = function () {
        this._tearingDown = true;
        for (var i = 0; i < this._children.length; i++) {
            this._children[i].tearingDown();
        }
    }
    ScopePrivate.prototype.tearDown = function () {
        //console.log("tearing down", this);
        
        if (!this._tearingDown) // if it was initiated by a parent, it's already set
            this.tearingDown();
        
        var data = this._data;
        this._data = {};
        
        if (this._parent) {
            Object.setPrototypeOf(this._publicScope, Object.prototype);
            var parent = this._parent;
            this._parent = null;
            parent.childRemoved(this);
        }
        
        
        var children = this._children.slice();
        for (var i = 0; i < children.length; i++) {
            children[i].tearDown();
        }
        
        for (var key in this._dependents) if (this._dependents.hasOwnProperty(key)) {
            var val = data[key];
            var deps = this._dependents[key];
            for (var i = 0; i < deps.length; i++) {
                deps[i](this, key, undefined, val);
            }
        }
        this._dependents = null;
        
        for (var key in this._delayedProps) if (this._delayedProps.hasOwnProperty(key)) {
            this._delayedProps[key].detach();
        }
        this._delayedProps = null;
        this._valueStacks = null;
        delete scopes[this._id];
    };
    
    
    
    var accessStack = [];
    
    function recordAccess() {
        accessStack.push([]);
    }
    function endRecordAccess() {
        return accessStack.pop();
    }
    
    ScopePrivate.prototype.notifyAccessed = function(name) {
        if (this._tearingDown)
            return;
        
        //console.log(name, "accessed in", this);
        if (accessStack.length) {
            accessStack[accessStack.length - 1].push([this, name]);
        }
    };
    
    ScopePrivate.prototype.notifyShadowing = function(name) {
        //console.log(name,"is now being shadowed in", this);
        var s = this._parent;
        while (!s._publicScope.hasOwnProperty(name)) {
            s = s._parent;
        }
        s.beingShadowed(name);
    };
    
    ScopePrivate.prototype.childAdded = function (scope) {
        //console.log(this,"has new child", scope);
        this._children.push(scope);
    };

    ScopePrivate.prototype.childRemoved = function (scope) {
        //console.log(this,"no longer has child", scope);
        this._children.splice(this._children.indexOf(scope), 1)
    };
        
    ScopePrivate.prototype.beingShadowed = function (name) {
        var val = this._publicScope[name]; // this._data[name];
        this.notifyChanged(name, val, val);
    };    
    
    function getPrivateScopeFor(publicScope) {
        var s = scopes[publicScope._id];
        if (s._publicScope === publicScope)
            return s;
        return null;
    }
    
    // ----------------------------------
    
    function ExpressionPrivate(exp, scope, callback, onDestroy) {
        
        var func = new Function("scope", "with(scope){return " + exp +"}");
        var value;
        var destroying = false;
        var onChange = function () {
            //console.log("expression",exp,"has changed");
            if (scope._tearingDown || destroying) {
                var deps = myDependencies;
                myDependencies = null;
                if (deps) for (var i = 0; i < deps.length; i++) {
                    var dep = deps[i];
                    dep[0].off(dep[1], onChange);
                }
                if (onDestroy)
                    onDestroy();
                return;
            }
            evaluate();
        };
        
        onChange.displayName="onChange[" + exp +"]";
        
        var myDependencies;
        var initial = true;
        var evalutating = false;
        evaluate();
        initial = false;
        
        // only if you're ready to handle destruction can we allow you to keep a reference to us
        if (onDestroy) {
            return {
                destroy: function () {
                    if (destroying)
                        return;
                    destroying = true;
                    onChange();
                }
            }
        }
        
        
        function evaluate () {
            if (evalutating) {
                return;
                //throw "cyclic dependency when evaluating " + exp;
            }
            evalutating = true;
            recordAccess();
            var newValue;
            var threw = false;
            try {
                newValue = func(scope._publicScope);
            } catch (ex) {
                //console.log("expression", exp, "threw", ex, " -- returning undefined");
                threw = true;
            }
            var newDependencies = endRecordAccess();
            if (threw||true) { // the dependency might not have been defined yet -- must watch for everything for now; with Proxy this can become smarter
                newDependencies.push([scope, null]);                
            }
            if (myDependencies) for (var i = 0; i < myDependencies.length; i++) {
                var dep = myDependencies[i];
                dep[0].off(dep[1], onChange);
            }
            myDependencies = newDependencies;
            if (myDependencies) for (var i = 0; i < myDependencies.length; i++) {
                var dep = myDependencies[i];
                dep[0].on(dep[1], onChange);
            }
            if (initial || value !== newValue) {
                callback(newValue);
                value = newValue;
            }
            evalutating = false;
        }
    }    
    
    // ----------------------------------
    
    window.Scope = function (parent, name) {
        var privateParent = null;
        if (parent) {
            privateParent = getPrivateScopeFor(parent);
        }
        var newScope = new ScopePrivate(privateParent, name);
        return newScope._publicScope;
    };
    
    window.Expression = function(exp, scope, callback) {
        ExpressionPrivate(exp, getPrivateScopeFor(scope), callback);
    };
    
})();