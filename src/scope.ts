
declare interface ObjectConstructor {
    setPrototypeOf(obj: Object, proto: Object): void;
}

declare interface Function {
    displayName: string;
    name: string;
}

declare interface Window {
    Scope(parent?: IPublicScope, name?: string): IPublicScope;
    Expression: any;//FIXME
}

interface ISetter<T> {
    (value: T): void
}

interface IStringDict {
    [p: string]: string;
}

interface IDelayedProperty<T> {
    attach(setter: (v: T) => void): void;
    detach(): void;
    getCurrentValue(): T;
}

interface IPublicScope {
    set(name: string, value: any): void;
    multiSet(name: string, value: any, token?: number) : number;
    unMultiSet(name: string, token: number): void;
    createDelayed<T>(name: string, attach: (setter: ((v: T) => void)) => void, detach: () => void, getCurrentValue: () => T): void;
    tearDown(): void;
    _id: number;
}

interface IDestroyable {
    destroy(): void;
}


namespace QE {
    
    var nextId = 1;
    var scopes: { [id: number] : ScopePrivate } = {};
    
    class ScopePrivate {
        
        _data: { [name: string] : any };
        _children: ScopePrivate[];
        _parent?: ScopePrivate;
        _dependents: { [name: string] : (() => void)[] };
        _id: number;
        _delayedProps: { [name: string]: IDelayedProperty<any> };
        _name?: string;
        _valueStacks: { [name: string]: any[]};
        _publicScope: IPublicScope;
        _tearingDown: boolean;
        
        constructor(parent?: ScopePrivate, name?: string) {
        
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
            this._publicScope.set = function<T>(name: string, value: T) {
                this.multiSet(name, value, 0);
            };
            this._publicScope.multiSet = function<T>(name: string, value: T, token?: number) { // token is optional
                var stack: T[] = that._valueStacks[name];
                if (!stack) {
                    stack = that._valueStacks[name] = [];
                    stack.length = 1;
                }
                if (typeof token !== "number") {
                    for (let i = 1; i <= stack.length; i++) { // note  "1" and "<=", both intentional
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
            this._publicScope.unMultiSet = function(name: string, token: number) {
                var stack = that._valueStacks[name];
                delete stack[token];
                that.applyValueStack(name);
            };

            this._publicScope.createDelayed = function<T>(name: string, attach: (setter: ((v: T) => void)) => void, detach: () => void, getCurrentValue: () => T) {
                that.set(name, {
                    attach: attach,
                    detach: detach,
                    getCurrentValue: getCurrentValue
                }, "create");
            };
            this._publicScope.set("$self", this._publicScope);
            this._publicScope.set("$parent", Object.getPrototypeOf(this._publicScope));
            if (parent && parent._name) {
                this._publicScope.set(parent._name, Object.getPrototypeOf(this._publicScope));
            }
            this._publicScope.tearDown = function () {
                that.tearDown();
            };
        }
        
        /* if delayed=="create", then val is an object with these properties:
         * - attach(setter) -- returns the current value
         * - detach()
         * - getCurrentValue()
         * if there is already a delayed property, delayed must be "set" to allow
         * */
        
        set<T>(name: string, val: T | IDelayedProperty<T>, delayed?: string): void {
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
                    this._delayedProps[name] = val as IDelayedProperty<T>;
                } else if (delayed === "set") {
                    throw name + " is not a delayed property";
                }
                
                Object.defineProperty(this._publicScope, name, {
                    get: function () {
                        if (delayed === "create" && !attached) {
                            attached = true;
                            //console.log("attaching ", name, "in", that);
                            (val as IDelayedProperty<T>).attach(function (v: T) {
                                that.set(name, v, "set");
                            });
                            that._data[name] = (val as IDelayedProperty<T>).getCurrentValue();
                        }
                        var result = that._data[name];
                        that.notifyAccessed(name, (result && result._id && scopes[result._id] &&scopes[result._id]._publicScope === result) ? getPrivateScopeFor(result) : null);
                        return result;
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
            this.notifyChanged(name);
            if (shadowing) {
                this.notifyShadowing(name);
            }
        }
        
        applyValueStack<T>(name: string) {
            var stack: T[] = this._valueStacks[name];
            if (!stack)
                return;
            var any = false;
            for (let i = stack.length-1; i >= 0; i--) { // walk backwards -- non-defaults (i.e. tunnels) win
                if (i in stack) {
                    any = true;
                    this.set(name, stack[i]);
                    break;
                }
            }
            if (!any) {
                this.set(name, undefined);
            }
        }
        
        notifyChanged(name: string) {
            //console.log(name,"in",this,"changed from",oldVal,"to",newVal);
            
            if (this._tearingDown)
                return;
            
            var deps = this._dependents[name];
            if (deps) {
                deps = deps.slice();
                for (let i = 0; i < deps.length; i++) {
                    deps[i]();
                }
            }
            
            this.notifySomethingChanged();
        }
        
        notifySomethingChanged() {
            if (this._tearingDown)
                return;
            
            var deps = this._dependents["$$anything"];
            if (deps) {
                deps = deps.slice();
                for (let i = 0; i < deps.length; i++) {
                    deps[i]();
                }
            }
            for (let i = 0; i < this._children.length; i++) {
                this._children[i].notifySomethingChanged();
            }   
        }
        
        on(name: string, cb: () => void) {
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
        off(name: string, cb: () => void) {
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
        tearingDown() {
            this._tearingDown = true;
            for (let i = 0; i < this._children.length; i++) {
                this._children[i].tearingDown();
            }
        }
        tearDown() {
            //console.log("tearing down", this);
            
            if (!this._tearingDown) // if it was initiated by a parent, it's already set
                this.tearingDown();
            
            var data = this._data;
            this._data = {};
            
            if (this._parent) {
                Object.setPrototypeOf(this._publicScope, Object.prototype);
                let parent = this._parent;
                this._parent = null;
                parent.childRemoved(this);
            }
            
            
            var children = this._children.slice();
            for (let i = 0; i < children.length; i++) {
                children[i].tearDown();
            }
            
            for (let key in this._dependents) if (this._dependents.hasOwnProperty(key)) {
                let val = data[key];
                let deps = this._dependents[key];
                for (let i = 0; i < deps.length; i++) {
                    deps[i]();
                }
            }
            this._dependents = null;
            
            for (let key in this._delayedProps) if (this._delayedProps.hasOwnProperty(key)) {
                this._delayedProps[key].detach();
            }
            this._delayedProps = null;
            this._valueStacks = null;
            delete scopes[this._id];
        }
        
        notifyAccessed(name: string, valueIsScope: ScopePrivate) {
            if (this._tearingDown)
                return;
            
            //console.log(name, "accessed in", this);
            if (accessStack.length) {
                accessStack[accessStack.length - 1].push([this, name, valueIsScope]);
            }
        }
        
        notifyShadowing(name: string) {
            //console.log(name,"is now being shadowed in", this);
            var s = this._parent;
            while (!s._publicScope.hasOwnProperty(name)) {
                s = s._parent;
            }
            s.beingShadowed(name);
        }
        
        childAdded(scope: ScopePrivate) {
            //console.log(this,"has new child", scope);
            this._children.push(scope);
        }
    
        childRemoved(scope: ScopePrivate) {
            //console.log(this,"no longer has child", scope);
            this._children.splice(this._children.indexOf(scope), 1)
        }
            
        beingShadowed(name: string) {
            this.notifyChanged(name);
        }    
        
        
    }
    
    
    type AccessRecord = [ScopePrivate, string] | [ScopePrivate, string|null, ScopePrivate];
    
    var accessStack: AccessRecord[][] = [];
    
    function recordAccess() {
        accessStack.push([]);
    }
    function endRecordAccess() : AccessRecord[] {
        return accessStack.pop();
    }
    
    function getPrivateScopeFor(publicScope: IPublicScope) {
        var s = scopes[publicScope._id];
        if (s._publicScope === publicScope)
            return s;
        return null;
    }
    
    // ----------------------------------
    
    var nextExpressionId = 1;
    var exceptions: { [id: number]: [string, Error] } = {};
    var exceptionLogTimeout: number;
    var exceptionLoggers: ((expression: string, exception: Error) => void)[] = [];
    var doLogExceptionsToConsole = true;
    exceptionLoggers.push(function (expression: string, exception: Error) {
        if (doLogExceptionsToConsole && window.console && console.error) {
            console.error("Expression `" + expression + "` threw " + exception.constructor.name + ": " +  exception.message + ", treating as undefined\n", exception);
        }
    });
    function logException(exception: Error, expressionId: number, expression: string) {
        exceptions[expressionId] = [expression, exception];
        if (!exceptionLogTimeout) {
            exceptionLogTimeout = setTimeout(outputLog, 0);
        }
    }
    function noException(expressionId: number) {
        delete exceptions[expressionId];
    }
    function outputLog() {
        for (let i in exceptions) if (exceptions.hasOwnProperty(i)) {
            for (let handler of exceptionLoggers) {
                handler.apply(null, exceptions[i]);
            }
        }
        exceptions = {};
        exceptionLogTimeout = null;
    }
    
    export function onException(f: (expression: string, exception: Error) => void) {
        exceptionLoggers.push(f);
    }
    export function logPendingExceptions() {
        if (exceptionLogTimeout) {
            clearTimeout(exceptionLogTimeout);
            outputLog();
        }
    }
    export function logExceptionsToConsole(yesno: boolean) {
        doLogExceptionsToConsole = yesno;
    }
    
    function ExpressionPrivate<T>(exp: string, scope: ScopePrivate, callback: (v: T) => void) : void;
    function ExpressionPrivate<T>(exp: string, scope: ScopePrivate, callback: (v: T) => void, onDestroy: () => void): IDestroyable;
    function ExpressionPrivate<T>(exp: string, scope: ScopePrivate, callback: (v: T) => void, onDestroy?: () => void): IDestroyable | void {
        var id = nextExpressionId;
        nextExpressionId++;
        var func = new Function("scope", "with(scope){return " + exp +"}") as (s: IPublicScope) => T;
        var value: T;
        var destroying = false;
        var onChange = function () {
            //console.log("expression",exp,"has changed");
            if (scope._tearingDown || destroying) {
                let deps = myDependencies;
                myDependencies = null;
                if (deps) for (let i = 0; i < deps.length; i++) {
                    let dep = deps[i];
                    dep[0].off(dep[1], onChange);
                }
                value = undefined;
                if (onDestroy)
                    onDestroy();
                return;
            }
            evaluate();
        };
        
        onChange.displayName="onChange[" + exp +"]";
        
        var myDependencies: AccessRecord[];
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
            var newValue: T;
            var threw = false;
            try {
                newValue = func(scope._publicScope);
            } catch (ex) {
                //console.warn("expression", exp, "threw", ex, " -- returning undefined");
                logException(ex, id, exp);
                threw = true;
                newValue = undefined;
            }
            if (!threw) {
                noException(id);
            }
            var newDependencies = endRecordAccess();
            if (threw||true) { // the dependency might not have been defined yet -- must watch for everything for now; with Proxy this can become smarter
                newDependencies.push([scope, null]);                
            }
            if (myDependencies) for (let i = 0; i < myDependencies.length; i++) {
                let dep = myDependencies[i];
                dep[0].off(dep[1], onChange);
            }
            myDependencies = newDependencies;
            var scopeValued: AccessRecord[] = [];
            if (myDependencies) for (let i = 0; i < myDependencies.length; i++) {
                let dep = myDependencies[i];
                dep[0].on(dep[1], onChange);
                if (dep[2]) {
                    scopeValued.push([dep[2] as ScopePrivate, null]);
                    (dep[2] as ScopePrivate).on(null, onChange);
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
    
    // ----------------------------------
    
    export function Scope(parent?: IPublicScope, name?: string) : IPublicScope {
        var privateParent = null;
        if (parent) {
            privateParent = getPrivateScopeFor(parent);
        }
        var newScope = new ScopePrivate(privateParent, name);
        return newScope._publicScope;
    }
    
    export function Expression<T>(exp: string, scope: IPublicScope, callback: (v: T) => void): void;
    export function Expression<T>(exp: string, scope: IPublicScope, callback: (v: T) => void, onDestroy: () => void): IDestroyable;
    export function Expression<T>(exp: string, scope: IPublicScope, callback: (v: T) => void, onDestroy?: () => void): IDestroyable | void {
        return ExpressionPrivate(exp, getPrivateScopeFor(scope), callback, onDestroy);
    }
    
    
}