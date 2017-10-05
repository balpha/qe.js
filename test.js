(function () {
    var TESTS = [];
    var nextTestId = 0;
    function QETest() {
        if (location.search) {
            testCase(location.search.substr(1));
        } else {
            nextTest();
        }
    }
    function QETestResult(id, success) {
        var p = document.createElement("p");
        p.textContent = TESTS[id].name + ": " + success;
        document.body.appendChild(p);
        document.body.removeChild(document.querySelector("iframe"));
        nextTest();
    }
    
    function nextTest() {
        var id = nextTestId;
        if (!TESTS[id])
            return;
        nextTestId++;
        
        var iframe = document.createElement("iframe");
        iframe.src = "test.html?" + id;
        document.body.appendChild(iframe);
        
    }
    
    function testCase(id) {
        var test = TESTS[id];
        document.body.outerHTML = test.body;
        test.run(function (success) {
            window.parent.QETestResult(id, success);
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
    
    TESTS.push({
        name: "simple tunnel",
        body: "<body qe qe:x='data' qe-tunnel='42 into data'></body>",
        run: function (done) {
            QE();
            done(tools.attrIs("body", "x", "42"));
        }
    });
    
    TESTS.push({
        name: "class and $focus",
        body: '<body><div qe="container" qe:class="{focuswithin: childHasFocus}"><input qe qe-tunnel="$focus into container.childHasFocus"></div></body>',
        run: function (done) {
            QE();
            var ok = true;
            var inp = tools.qs("input");
            inp.blur();
            ok = ok && tools.attrIsEmpty("div", "class");
            inp.focus();
            ok = ok && tools.attrIs("div", "class", "focuswithin");
            inp.blur();
            ok = ok && tools.attrIsEmpty("div", "class");
            done(ok);
        }
    });
    
    TESTS.push({
        name: "conditional tunnel and $value for radios, programmatic",
        body: ['<body><div qe qe:selected-child="selected.$$element.getAttribute(\'value\')">',
               '<input type="radio" name="radiogroup" value="1" qe qe-tunnel="$$self into $$parent.selected if $value">',
               '<input type="radio" name="radiogroup" value="2" qe qe-tunnel="$$self into $$parent.selected if $value">',
               '<input type="radio" name="radiogroup" value="3" qe qe-tunnel="$$self into $$parent.selected if $value">',
               '</div></body>'].join(""),
        run: function (done) {
            QE();
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

    TESTS.push({
        name: "conditional tunnel and $value for radios, manual",
        body: ['<body><div qe qe:selected-child="selected.$$element.getAttribute(\'value\')">',
               '<label><input type="radio" name="radiogroup" value="1" qe qe-tunnel="$$self into $$parent.selected if $value"> Option 1</label><br>',
               '<label><input type="radio" name="radiogroup" value="2" qe qe-tunnel="$$self into $$parent.selected if $value"> Option 2</label><br>',
               '<label><input type="radio" name="radiogroup" value="3" qe qe-tunnel="$$self into $$parent.selected if $value"> Option 3</label><br>',
               '</div><style>div::after{content: "Selected option: " attr(selected-child);}</style></after>',
               '<br><button id="success">works great</button> <button id="failure">not so much</button>',
               '</body>'].join(""),
        run: function (done) {
            QE();
            document.getElementById("success").addEventListener("click", function () { done(true); });
            document.getElementById("failure").addEventListener("click", function () { done(false); });
        }
    });
    
    TESTS.push({
        name: "$value for text inputs and $$global, manual",
        body: ['<body><div qe qe:style="\'width:50px;height:50px;background-color:\' + color"></div>',
               'Type a CSS color here, and also try the "random" button:<br>',
               '<input qe qe-tunnel="$value into $$global.color">',
               ' <button id="random-color">random</button>',
               '<br><button id="success">works great</button> <button id="failure">not so much</button>',
               '</body>'].join(""),
        run: function (done) {
            QE();
            document.getElementById("success").addEventListener("click", function () { done(true); });
            document.getElementById("failure").addEventListener("click", function () { done(false); });
            document.getElementById("random-color").addEventListener("click", function () {
                var rgb = [0,0,0].map(function () { return Math.random() * 255 | 0;});
                tools.qs("input").value = "rgb(" + rgb.join() + ")";
            });
        }
    });
    
    TESTS.push({
        name: "previously missing properties are still dependencies",
        body: ['<div class="form-container" qe qe:class="{\'focus-inside\': inputHasFocus }">',
                '<input id="one" type="text" qe qe-tunnel="$focus into $$parent.inputHasFocus if $$parent.useFirst"><br>',
                '<input id="two" type="text" qe qe-tunnel="$focus into $$parent.inputHasFocus if !$$parent.useFirst"><br>',
                '<label><input id="cb" type="checkbox" qe qe-tunnel="$value into $$parent.useFirst">Use the first input to control the focus-inside style</label>',
                '</div>'].join(""),
        run: function (done) {
            QE();
            var ok = !tools.qs(".form-container").classList.contains("focus-inside");
            tools.qs("#one").focus();
            ok = ok && !tools.qs(".form-container").classList.contains("focus-inside");
            tools.qs("#two").focus();
            ok = ok && tools.qs(".form-container").classList.contains("focus-inside");
            tools.qs("#two").blur();
            ok = ok && !tools.qs(".form-container").classList.contains("focus-inside");
            tools.qs("#cb").checked = true;
            ok = ok && !tools.qs(".form-container").classList.contains("focus-inside");
            tools.qs("#one").focus();
            ok = ok && tools.qs(".form-container").classList.contains("focus-inside");
            tools.qs("#two").focus();
            ok = ok && !tools.qs(".form-container").classList.contains("focus-inside");
            tools.qs("#two").blur();
            ok = ok && !tools.qs(".form-container").classList.contains("focus-inside");
            done(ok);
        }
    });
        
    window.QETest = QETest;
    window.QETestResult = QETestResult;
})();