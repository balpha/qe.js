(function () {
    var MANUAL_TESTS = [], AUTOMATIC_TESTS = [], TESTS;
    var nextTestId = 0;
    function QETest() {
        TESTS = AUTOMATIC_TESTS.concat(MANUAL_TESTS);
        setTimeout(function () {
            if (location.search) {
                tools.qs("head").removeChild(tools.qs("style"));
                testCase(location.search.substr(1));
            } else {
                nextTest();
            }
        }, 0);
    }
    function QETestResult(id, success, exceptions) {
        setTimeout(function() {
            var p = document.getElementById("result-" + id);
            p.textContent = TESTS[id].name + ": " + (success ? "pass" : "fail") + (exceptions > 0 ? " [" + exceptions + " exception(s)]" : "");
            p.classList.remove("pending");
            p.classList.add(success ? "pass" : "fail");
            if (exceptions > 0) {
                p.classList.add("exceptions");
            }
            tools.qs("#iframeholder").removeChild(tools.qs("iframe"));
            nextTest();
        }, 0);
    }
    
    function nextTest() {
        var id = nextTestId;
        if (!TESTS[id])
            return;
        nextTestId++;

        var p = document.createElement("p");
        p.classList.add("pending");
        p.id = "result-" + id;
        p.textContent = TESTS[id].name + ": pending";
        tools.qs("#log").appendChild(p);
        tools.qs("#log").scrollTop = 1e9;
        
        var iframe = document.createElement("iframe");
        iframe.src = "test.html?" + id;
        tools.qs("#iframeholder").appendChild(iframe);
    }
    
    function testCase(id) {
        var test = TESTS[id];
        test.run(function (success, exceptions) {
            window.parent.QETestResult(id, success, exceptions);
        });
    }
    
    var tools = {
        attrIs: function (selector, attr, expected) {
            var actual = document.querySelector(selector).getAttribute(attr);
            if (actual !== expected) {
                console.log(selector+"[" + attr + "] -- expected", expected, "but found", actual);
                return false;
            }
            return true;
        },
        attrIsEmpty: function (selector, attr) {
            return !document.querySelector(selector).getAttribute(attr);
        },
        qs: function (selector) {
            return document.querySelector(selector);
        }
    };
    
    // IE doesn't have Object.assign
    function copy(target, from) {
        for (var p in from) if (from.hasOwnProperty(p)) {
            target[p] = from[p];
        }
        return target;
    }
    
    function TEST(t){
        var t1 = copy({}, t);
        t1.run = function (done) {
            var exceptionCount = 0;
            QE.onException(function () { exceptionCount++; });
            document.body.outerHTML = t1.body;
            QE.init();
            t.run(function (success) {
                QE.logPendingExceptions();
                done(success, exceptionCount);
            });
        };
        t1.name = "[static] " + t1.name;
        
        var t2 = copy({}, t);
        t2.run = function (done) {
            QE.logExceptionsToConsole(false);
            var div = document.createElement("div");
            document.body.outerHTML = t1.body;
            var children = Array.prototype.slice.call(document.body.childNodes);
            var addAttr = [];
            for (var i = 0; i < children.length; i++) {
                var child = children[i];
                div.appendChild(child);
            }
            var withAttr = div.querySelectorAll("[qe]");
            for (var i = 0; i < withAttr.length; i++) {
                if (Math.random() < 0.5)
                    continue;
                var el = withAttr[i];
                addAttr.push([el, el.getAttribute("qe")]);
                el.removeAttribute("qe");
            }
            
            var body = document.body;
            if (Math.random() >= 0.5 && body.hasAttribute("qe")) {
                addAttr.push([body, body.getAttribute("qe")]);
                body.removeAttribute("qe");
            }
            QE.init();
            setTimeout(function () {
                for (var i = 0; i < children.length; i++) {
                    document.body.appendChild(children[i]);
                }
                var added = 0;
                for (var i = 0; i < addAttr.length; i++) {
                    (function (i) {
                        setTimeout(function () {
                            addAttr[i][0].setAttribute("qe", addAttr[i][1]);
                            added++;
                            if (added === addAttr.length) {
                                setTimeout(runNow, 0);
                            }
                        }, Math.random() * 100);
                    })(i);
                }
                if (!addAttr.length) {
                    setTimeout(runNow, 0);                    
                }
                
            }, 0);
            function runNow() {
                QE.logPendingExceptions();
                QE.logExceptionsToConsole(true);
                var exceptionCount = 0;
                QE.onException(function () { exceptionCount++; });
                t.run(function (success) {
                    QE.logPendingExceptions();
                    done(success, exceptionCount);
                });
            }
        };
        t2.name = "[dynamic] " + t2.name;
        
        var into = t.manual ? MANUAL_TESTS : AUTOMATIC_TESTS;
        
        into.push(t1);
        into.push(t2);
        
    }
    
    // anything that happens in response to a focus or blur has to be checked
    // asynchronously in IE (not Edge), because it fires those events asynchronously.
    function asyncInIE (f) {
        f();
    }
    if (/Trident/.test(navigator.userAgent)) {
        asyncInIE = function(f){ setTimeout(f, 10); };
    }
    
    TEST({
        name: "simple tunnel",
        body: "<body qe qe:x='data' qe-tunnel='42 into data'></body>",
        run: function (done) {
            done(tools.attrIs("body", "x", "42"));
        }
    });
    
    TEST({
        name: "class and $focus",
        body: '<body><div qe="container" qe:class="{focuswithin: childHasFocus}"><input qe qe-tunnel="$focus into container.childHasFocus"></div></body>',
        run: function (done) {
            var ok = true;
            var inp = tools.qs("input");
            inp.blur();
            asyncInIE(function () {
                ok = ok && tools.attrIsEmpty("div", "class");
                inp.focus();
                asyncInIE(function () {
                    ok = ok && tools.attrIs("div", "class", "focuswithin");
                    //debugger;
                    inp.blur();
                    asyncInIE(function () {
                        ok = ok && tools.attrIsEmpty("div", "class");
                        done(ok);
                    });
                });
            });
        }
    });
    
    TEST({
        name: "conditional tunnel and $value for radios, programmatic",
        body: ['<body><div qe qe:selected-child="$self.selected ? selected.$element.getAttribute(\'value\') : null">',
               '<input type="radio" name="radiogroup" value="1" qe qe-tunnel="$self into $parent.selected if $value">',
               '<input type="radio" name="radiogroup" value="2" qe qe-tunnel="$self into $parent.selected if $value">',
               '<input type="radio" name="radiogroup" value="3" qe qe-tunnel="$self into $parent.selected if $value">',
               '</div></body>'].join(""),
        run: function (done) {
            var ok = tools.attrIsEmpty("div", "selected-child");
            for (i=0; i < 100; i++) {
                var choice = Math.random() * 4 | 0;
                if (choice === 0) {
                    var cur = tools.qs(":checked");
                    if (cur) {
                        cur.checked = false;
                    }
                    ok = tools.attrIsEmpty("div", "selected-child") && ok;
                } else {
                    tools.qs("[value='" + choice + "']").checked = true;
                    ok = tools.attrIs("div", "selected-child", "" + choice) && ok;
                }
            }
            done(ok);
        }
    });

    TEST({
        name: "conditional tunnel and $value for radios, manual",
        body: ['<body><div qe qe:selected-child="$self.selected ? selected.$element.getAttribute(\'value\') : null">',
               '<label><input type="radio" name="radiogroup" value="1" qe qe-tunnel="$self into $parent.selected if $value"> Option 1</label><br>',
               '<label><input type="radio" name="radiogroup" value="2" qe qe-tunnel="$self into $parent.selected if $value"> Option 2</label><br>',
               '<label><input type="radio" name="radiogroup" value="3" qe qe-tunnel="$self into $parent.selected if $value"> Option 3</label><br>',
               '</div><style>div::after{content: "Selected option: " attr(selected-child);}</style></after>',
               '<br><button id="success">works great</button> <button id="failure">not so much</button>',
               '</body>'].join(""),
        run: function (done) {
            document.getElementById("success").addEventListener("click", function () { done(true); });
            document.getElementById("failure").addEventListener("click", function () { done(false); });
        },
        manual: true
    });
    // 
    TEST({
        name: "$value for text inputs and $global, manual",
        body: ['<body><div qe qe:style="\'width:50px;height:50px;\'+ (color ? \'background-color:\' + color : \'\')"></div>',
               'Type a CSS color here, and also try the "random" button:<br>',
               '<input qe qe-tunnel="$value into $global.color">',
               ' <button id="random-color">random</button>',
               '<br><button id="success">works great</button> <button id="failure">not so much</button>',
               '</body>'].join(""),
        run: function (done) {
            document.getElementById("success").addEventListener("click", function () { done(true); });
            document.getElementById("failure").addEventListener("click", function () { done(false); });
            document.getElementById("random-color").addEventListener("click", function () {
                var rgb = [0,0,0].map(function () { return Math.random() * 255 | 0;});
                tools.qs("input").value = "rgb(" + rgb.join() + ")";
            });
        },
        manual: true
    });
    
    TEST({
        name: "previously missing properties are still dependencies; $value for checkboxes",
        body: ['<body><div class="form-container" qe qe:class="{\'focus-inside\': inputHasFocus }">',
                '<input id="one" type="text" qe qe-tunnel="$focus into $parent.inputHasFocus if $parent.useFirst"><br>',
                '<input id="two" type="text" qe qe-tunnel="$focus into $parent.inputHasFocus if !$parent.useFirst"><br>',
                '<label><input id="cb" type="checkbox" qe qe-tunnel="$value into $parent.useFirst">Use the first input to control the focus-inside style</label>',
                '</div></body>'].join(""),
        run: function (done) {
            var ok = !tools.qs(".form-container").classList.contains("focus-inside");
            tools.qs("#one").focus();
            asyncInIE(function () {
                ok = ok && !tools.qs(".form-container").classList.contains("focus-inside");
                tools.qs("#two").focus();
                asyncInIE(function () {
                    ok = ok && tools.qs(".form-container").classList.contains("focus-inside");
                    tools.qs("#two").blur();
                    asyncInIE(function () {
                        ok = ok && !tools.qs(".form-container").classList.contains("focus-inside");
                        tools.qs("#cb").checked = true;
                        ok = ok && !tools.qs(".form-container").classList.contains("focus-inside");
                        tools.qs("#one").focus();
                        asyncInIE(function () {
                            ok = ok && tools.qs(".form-container").classList.contains("focus-inside");
                            tools.qs("#two").focus();
                            asyncInIE(function () {
                                ok = ok && !tools.qs(".form-container").classList.contains("focus-inside");
                                tools.qs("#two").blur();
                                asyncInIE(function () {
                                    ok = ok && !tools.qs(".form-container").classList.contains("focus-inside");
                                    done(ok);
                                });
                            });
                        });
                    });
                });
            });
        }
    });
    
    TEST({
        name: "scope constants and indirect tunnels",
        body: [
            '<body><div qe="outer" qe.t-selected="$parent.$element.id into outer.selected if $value" qe:aria-activedescendent="selected">',
            '<ul>',
            '<li qe id="item-1"><input type="radio" name="group" qe qe-tunnel="@tSelected"></li>',
            '<li qe id="item-2"><input type="radio" name="group" qe qe-tunnel="@tSelected"></li>',
            '<li qe id="item-3"><input type="radio" name="group" qe qe-tunnel="@tSelected"></li>',
            '</ul></div></body>'
        ].join(""),
        run: function (done) {
            var ok = tools.attrIsEmpty("div", "aria-activedescendent");
            for (var i = 0; i < 50; i++) {
                var choice = "item-" + (1 + Math.random() * 3 | 0);
                tools.qs("#" + choice + " input").checked = true;
                ok = ok && tools.attrIs("div", "aria-activedescendent", choice);
            }
            done(ok);
        }
    });
    
    TEST({
        name: "multiple tunnels",
        body: [
            '<body><div qe qe:x="v4" qe-tunnel="v3 into v4; v2 into v3; v1 into v2; \'hello\' into v1"></body>'
        ].join(""),
        run: function (done) {
            done(tools.attrIs("div", "x", "hello"));
        }
    });

    TEST({
        name: "correct value when returning from multiple tunnels into one property back to a single one",
        body: [
            '<body><div qe qe:x="x">',
            '<input id="one" type="checkbox" qe qe-tunnel="1 into $parent.x if $value">',
            '<input id="two" type="checkbox" qe qe-tunnel="2 into $parent.x if $value">',
            '</div>',
            '</body>'
        ].join(""),
        run: function (done) {
            var one = tools.qs("#one");
            var two = tools.qs("#two");
            var ok = tools.attrIsEmpty("div", "x");
            one.checked = true;
            ok = ok && tools.attrIs("div", "x", "1");
            two.checked = true;
            var cur = tools.qs("div").getAttribute("x");
            ok = ok && (cur === "1" || cur === "2");
            two.checked = false;
            ok = ok && tools.attrIs("div", "x", "1");
            done(ok);
        }
    });

    TEST({
        name: "correct value when a tunnel used to exit in an attribute constant",
        body: [
            '<body><div qe qe:x="x" qe.x="hello">',
            '<input type="checkbox" qe qe-tunnel="\'goodbye\' into $parent.x if $value">',
            '</div>',
            '</body>'
        ].join(""),
        run: function (done) {
            var cb = tools.qs("input");
            var ok = tools.attrIs("div", "x", "hello");
            cb.checked = true;
            ok = ok && tools.attrIs("div", "x", "goodbye");
            cb.checked = false;
            ok = ok && tools.attrIs("div", "x", "hello");
            done(ok);
        }
    });
    TEST({
        name: "$hover, manual",
        body: [
            '<body><style>.hide {display:none}</style>',
            '<div qe style="width: 100px; height: 100px; background: #ccc;"> Hover me<br>',
            '<span qe class="hide" qe:style="$parent.$hover ? \'display:inline\' : false">Thanks!</button></div>',
            '<br><button id="success">works great</button> <button id="failure">not so much</button>',
            '</body>'].join(""),
        run: function (done) {
            document.getElementById("success").addEventListener("click", function () { done(true); });
            document.getElementById("failure").addEventListener("click", function () { done(false); });
        },
        manual: true
    });
    TEST({
        name: "$attributes",
        body: [
            '<body qe qe:x="$attributes.y" qe:y="input.$value">',
            '<input value="xyz" qe qe-tunnel="$self into $parent.input">',
            '</body>'].join(""),
        run: function (done) {
            setTimeout(function () {
                var ok = tools.attrIs("body", "x", "xyz");
                tools.qs("input").value="abc";
                setTimeout(function () {
                    done(ok && tools.attrIs("body", "x" ,"abc"));
                }, 0);
            }, 0);
        }
    });
    TEST({
        name: "style",
        body: [
            '<body qe qe:style="{\'padding-top\': \'47px\'}">',
            '</body>'].join(""),
        run: function (done) {
            setTimeout(function () {
                var ok = getComputedStyle(document.body).paddingTop === "47px";
                done(ok);
            }, 0);
        }
    });    
    window.QETest = QETest;
    window.QETestResult = QETestResult;
})();