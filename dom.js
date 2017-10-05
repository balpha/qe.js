(function () {
    var globalScope;
    
    function build() {
        if (globalScope)
            globalScope.tearDown();
        globalScope = Scope();
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
        };
        var getCurrenValue = function () {
            var found = elem.parentElement.querySelectorAll(selector);
            //console.log(selector, found);
            for (var i = 0; i < found.length; i++) {
                if (found[i] === elem) {
                    return true;
                }
            }
            return false;
        };
        
        scope.createDelayed(prop, attach, detach, getCurrenValue);
    }
    
    function domScope(elem, parentScope, name) {
        var scope = Scope(parentScope, name);
        
        addHover(elem, scope);
        addFocus(elem, scope);
        
        scope.set("$$element", elem);
        
        return scope;
    }
    
    function buildScopes(elem, parentScope) {
        if (elem.nodeType != Node.ELEMENT_NODE)
            return;
        var nextParentScope = parentScope;
        if (elem.hasAttribute("qe")) {
            var name = elem.getAttribute("qe") || null;
            var scope = domScope(elem, parentScope, name);
            elem.QEScope = scope;
            nextParentScope = scope;
            var attrs = Array.prototype.slice.call(elem.attributes);
            for (var i = 0; i < attrs.length; i++) {
                var attr = attrs[i];
                if (/^qe:/.test(attr.name)) {
                    var actualAttr = attr.name.substr(3);
                    Expression(attr.value, scope, function (val) {
                        
                        if (actualAttr === "class" && typeof val !== "string") {
                            if (typeof(val) === "object") {
                                for (var cls in val) if (val.hasOwnProperty(cls)) {
                                    if (val[cls]) {
                                        elem.classList.add(cls);
                                    } else {
                                        elem.classList.remove(cls);
                                    }
                                }
                            }
                        } else if (val === false || val === null || val === undefined) {
                            elem.removeAttribute(actualAttr);
                        } else {
                            elem.setAttribute(actualAttr, "" + val);
                        }
                    });
                } else if (attr.name === "qe-tunnel") {
                    var tunnelexprs = attr.value.split(",");
                    for (var j = 0; j < tunnelexprs.length; j++) {
                        var parts = tunnelexprs[j].split(" into ");
                        if (parts.length != 2) {
                            throw "invalid syntax in tunnel expression " + attr.value; 
                        }
                        // FIXME: also check that there's only dot-lookup
                        
                        var exitAndCondition = parts[1].split(" if ");
                        
                        if (exitAndCondition.length > 2) {
                            throw "invalid syntax in tunnel expression " + attr.value; 
                        }
                        
                        var tunnelExit = exitAndCondition[0].trim();
                        var lastDot = tunnelExit.lastIndexOf(".");
                        var tunnelExitScopeExpr, tunnelExitProperty;
                        if (lastDot !== -1) {
                            tunnelExitScopeExpr = tunnelExit.substr(0, lastDot);
                        } else {
                            tunnelExitScopeExpr = "$$self"; 
                        }
                        tunnelExitProperty = tunnelExit.substr(lastDot + 1);
                        var tunnelEntrance = parts[0];
                        var tunnelCondition = exitAndCondition[1];
                        
                        var tunnelExitScope;
                        var tunnelValue;
                        var tunnelActive = !tunnelCondition;
                        var lastSetId = -1;
                        var doTunnel = function () {
                            if (tunnelExitScope) {
                                if (tunnelActive)
                                    lastSetId = tunnelExitScope.set(tunnelExitProperty, tunnelValue);
                                else
                                    lastSetId = tunnelExitScope.setIfPreviouslySet(tunnelExitProperty, undefined, lastSetId);
                            }
                        };
                        Expression(tunnelExitScopeExpr, scope, function (s) {
                            if (tunnelActive && tunnelExitScope) {
                                tunnelActive = false;
                                doTunnel();
                                tunnelActive = true;
                            }
                            tunnelExitScope = s;
                            doTunnel();
                        });

                        if (tunnelCondition) {
                            Expression(tunnelCondition, scope, function(v) {
                                tunnelActive = !!v;
                                doTunnel();
                            });
                            
                        }
                        
                        Expression(tunnelEntrance, scope, function (v) {
                            tunnelValue = v;
                            doTunnel();
                        });
                        
                        
                        
                    }
                }
            }
        }
        for (var i = 0; i < elem.children.length; i++) {
            buildScopes(elem.children[i], nextParentScope);
        }
    }
    
    function anyNodeIsQe(nodeList) {
        for (var i = 0; i<nodeList.length; i++) {
            var node = nodeList[i];
            if (node.nodeType !== Node.ELEMENT_NODE)
                continue;
            if (node.hasAttribute("qe"))
                return true;
            if (node.querySelector("*[qe]"))
                return true;
        }
        return false;
    }
    
    window.QE = function () {
        build();
        
        var mo = new MutationObserver(function (mrs) {
            for (var i = 0; i < mrs.length; i++) {
                var mr = mrs[i];
                
                if (mr.type === "attributes" && /^qe/.test(mr.attributeName)) {
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
            subtree: true
        });
    }
})();