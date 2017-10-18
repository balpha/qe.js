## Introduction

### Motivation
I have recently worked on a few projects in Talent's Candidate Search. Candidate Search is an Angular app, and there is one particular thing about working in it that I've really enjoyed: The ability to *declaratively* define dynamic attributes on HTML elements.

What does that mean? Here's an Angular example that works around the lack of browser support for the [`:focus-within` pseudo-class](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-within):

```html
<div ng-class="{'focus-within': inputHasFocus}">
	<input ng-focus="inputHasFocus=true" ng-blur="inputHasFocus=false">
</div>
```

Notice how we're saying that the `<div>` should have the CSS class `focus-within` *if and only if* a certain condition is met. We're not saying "if X happens, then add the class; if Y happens then remove the class"; rather, we're specifying *under what conditions* the class should be there. That's declarative.

Of course the illusion breaks down fairly quickly in the above example, because the presence of the `ng-focus` and `ng-blur` handlers shows that we're still deep into imperative territory. But the fact alone that there's no `$(this).closest("div").addClass("...")` happening in the handler -- it's the `<div>` that is responsible for its own CSS classes, rather than some other element imposing them on it -- is a win.

I started thinking about how we could get something nice like this in the Core code. The Core JavaScript has a large amount of code that does something like this:

```js
popup.find('input:radio:not(.action-subform input)')
	.on('click', function () {
		$(this).closest('li').addClass('action-selected')
			.siblings(".action-selected").removeClass('action-selected');
	});
```

or like this:

```js
$('.review-actions input').attr('disabled', 'disabled');
loadPopup({...}).done(function ($popup) {
	$popup.on("popupClose", function () {
	    $('.review-actions input').removeAttr('disabled');
	});
});
```

and I would really like to have less of it, making the element itself (in the HTML) define under what circumstances it wants to be disabled or have a certain CSS class.

So I started thinking about creating a library that gives us nice things. In order for this to work for us, I considered the following points vital:

- It should play nicely with static HTML. We cannot require some sort of JS-defined component to render all elements for us on the client side.
- It should not require any per-element initialization. If we have to
	
	```js
	$(".some-marker-class").each(attachCoolBehavior);
	loadPopup().done(function ($popup) {
		attachCoolBehavior($popup);
	});
	```

	everywhere, we're just trading one JS boilerplate for another, and we have to make sure to call the function every time we *might* add HTML that requires it.
- It should embrace the DOM. Creating event handlers, setting `$(".my-input").val(newtext)`, etc., all the things we do in our vanilla JS approach to client-side code should continue to work without us having to work around things.

So below I'm going to describe what I came up with.

### Looking for feedback

I have a working proof-of-concept. It has a lot of room for optimizations, but for the time being it largely works, and it does so in all current browsers down to IE11. If we want to support IE10, that should be possible with an additional polyfill.

**What I want to know now** is if others are as excited about this as I am, so that it makes sense to continue working on it. Anything is up for discussion: Features, syntax, does it make sense at all, does it seem useful?

## Introducing QE.js

QE stands for "quantum entanglement". There is already a JavaScript [project](https://github.com/aidanbdh/quantum-entanglement) called "quantum entanglement" (because of course there is), so I just went with the abbreviation.

On the JavaScript side, all it requires is a single call `QE.init()` at some point to initialize the library. Afterwards, any HTML element, whether it was in the original HTML document or added to the DOM via JS at any time, can be given magic behavior just by virtue of having the `qe` attribute.

```html
<div class="whatever" qe>Hello!</div>
```

We say that an element with the `qe` attribute is **"entangled"**.

The above example isn't very interesting, because it doesn't actually do anything yet. Let's rebuild the `focus-within` example from above in QE.js. We have this HTML:

```html
<div>
	<input type="text">
</div>
```

and we want the `<div>` to have the CSS class `focus-within` whenever the `<input>` is focused. So we need to entangle both elements:

```html
<div qe>
	<input type="text" qe>
</div>
```

Every entangled element gets a set of properties associated with it, called its **"Scope"**. You can imagine it to be similar to jQuery's `.data()`, but instead of setting and getting values on it, you *declare* where it gets its data from.

Let's assume the `<div>`'s scope has a property `childHasFocus`. We can then give the element an **"attribute expression"** that says it should have the CSS class `focus-within` whenever `childHasFocus` is true.

```html
<div qe qe:class="{'focus-within': childHasFocus}">
	<input type="text" qe>
</div>
```

An attribute expression (inspired by [Vue's `v-bind` directive](https://vuejs.org/v2/api/#v-bind)) is defined by any attribute that starts with `qe:`, e.g. `qe:disabled` or `qe:aria-activedescendant`. Whatever the expression evaluates to will be the value of the `disabled` or `aria-activedescendant` attribute. Usually it will be a string, but there is special handling for `qe:class` and `qe:style` that allow the expression to evaluate to an object, which makes the `focus-within` example above work.

Now of course it doesn't work *yet*, because the `<div>`'s scope doesn't *have* a `childHasFocus` property yet.

So how do we set this property on its scope?

That was a trick question. We don't *set* anything, because *setting something* is imperative, and we're being declarative here.

We want to *declare* that the `childHasFocus` property should reflect the focus state of the `<input>` element.

We do this by telling the `<input>` element to **"tunnel"** its focus state into the `<div>` scope's `childHasFocus` property. Imagine a portal (or in more programmer-y terms, a view) that lives on the `<div>` scope and that sees the `<input>`'s focus state.

(Side note: This is mixing metaphors a little bit, because quantum tunneling is not actually the same thing as quantum entanglement. But we're not doing actual physics here.)

Alright, so let's create a tunnel by giving the `<input>` element a `qe-tunnel` attribute with a **"tunnel expression"**:

```html
<div qe qe:class="{'focus-within': childHasFocus}">
	<input type="text" qe qe-tunnel="$focus into $parent.childHasFocus">
</div>
```

The `qe-tunnel` attribute can contain one or more tunnel expressions, separated by semicolons, each of which has the form <code>*expression* **into** *target.property* **if** *condition*</code>, and the `if condition` part is optional.

So, what do we have to do next?

That was a trick question again. We don't have to do anything; the above example does exactly what we wanted. We're done.

## Magic properties

So what's that `$focus` thing? And `$parent`?

The scope of any entangled element has a couple of built-in properties:

`$focus`
: is `true` or `false` depending on whether the element has focus.

`$hover`
: is `true` or `false` depending on whether the mouse cursor is over the element.

`$value`
: reflects an input element's value. For checkboxes and radio buttons it's `true` or `false`; otherwise it's a string.

`$parent`
: is the parent scope, i.e. the scope of the closest entangled ancestor element in the DOM. Scopes are also connected via the prototype chain, so when accessing a parent scope's property, you can often leave off the `$parent`.

`$element`
: is the actual HTML element that this scope belongs to.

`$attributes`
: allows you access the HTML element's attributes. For example, `$element.getAttribute("id")` and `$attributes.id` are *almost* equivalent -- however, if the `id` attribute changes at any time, QE has to re-evaluate any expressions that refer to this attribute. When you use the any non-QE method to get a value, like the element's `getAttribute` method, then QE doesn't know that the expression depends on the attribute. If you use `$attributes.id` instead, QE knows to re-evaluate the expression when the `id` attribute changes.

: If the attribute contains a dash ("kebab case"), you can refer to it by its original name or by its camel case conversion. So `$attributes["aria-label"]` and `$attributes.ariaLabel` are equivalent.

`$class`
: reflects the element's CSS classes. `$class.highlight` is `true` or `undefined`, depending on whether the element has class `highlight` or not. Classes in kebab case can also be refered to in camel case, so `$class.isSelected` and `$class["is-selected"]` both work. Note that because CSS classes are case sensitive, an element `<div class="isSelected is-selected">` in fact has two distinct classes, and `$class` will *not* do the right thing here. On the off-chance that you actually have such a case (you shouldn't!), you will need to parse `$attributes.class` instead.

`$global`
: is the ancestor scope of all element scopes.

`$self`
: refers to the scope itself. You can often leave this off (for example, the expressions `$self.$hover` and `$hover` are equivalent). However if a property doesn't always exist, say, `currentSelection` might be an error, but `$self.CurrentSelection` would just be `undefined` (similar to a global variable lookup with `console` versus `window.console`). Another use case for `$self` happens if an element wants to tunnel its complete scope somewhere else, e.g. `qe-tunnel="$self into $parent.child"`.

## Advanced usage

### Named scopes

Going back to our example from above, what happens if the input is not a direct child of the div?

```html
<div qe qe:class="{'focus-within': childHasFocus}">
	<form>
		<input type="text" qe qe-tunnel="$focus into $parent.childHasFocus">
	</form>
</div>
```

Trick question again! Nothing happens, everything is fine, because the `<form>` element is *not entangled*. So when it comes to QE scopes, the `<div>`'s is still the parent of the `<input>`'s.

Aha! So what *if* the `<form>` is also entangled?

```html
<div qe qe:class="{'focus-within': childHasFocus}">
	<form qe>
		<input type="text" qe qe-tunnel="$focus into $parent.childHasFocus">
	</form>
</div>
```

Yep, now things are breaking down. You'd have to change `$parent.childHasFocus` to `$parent.$parent.childHasFocus`, but you can already tell that this is brittle.

Luckily you can name a scope by giving the `qe` attribute an actual value, and then refer to it by that name in the descendent scopes:

```html
<div qe="focusContainer" qe:class="{'focus-within': childHasFocus}">
	<form qe>
		<input type="text" qe qe-tunnel="$focus into focusContainer.childHasFocus">
	</form>
</div>
```

Note the "in the descendent scopes" part. Named scopes still adhere to the document tree, so the property `focusContainer` isn't accessible in parents or siblings. If you want a scope to be accessible from *anywhere*, you have to tunnel it into the global scope:

```html
<nav qe qe-tunnel="$self into $global.mainNavigation">...</nav>
<div qe qe:style="{background: mainNavigation.$hover ? 'green' : 'blue'}">...</div>
```

### Property attributes

Sometimes you'll want a particular fixed value to be available to all descendent scopes. You *could* achieve that by creating a tunnel:

```html
<div qe qe-tunnel="'red' into highlightColor">
	<span qe qe:style="{background: $hover ? highlightColor : 'transparent'}">
	...
	</span>
</div>
```

But for cases like this, where the expression is just a constant string, there's a simpler way: A **"property attribute"**.

```html
<div qe qe.highlight-color="red">
	<span qe qe:style="{background: $hover ? highlightColor : 'transparent'}">
	...
	</span>
</div>
```

Property attributes start with `qe.`, followed by the name of the property. Since attributes are case-insensitve, kebab case (`qe.highlight-color`) will be converted to camel case (`highlightColor`).

Property attributes are particularly useful when combined with indirect tunnels, which are described the next section.

### Indirect tunnel expressions

Often you will have multiple child elements that all tunnel the same expression into a parent scope, based on some state:

```html
<ul qe="list" qe:aria-activedescendant="selectedItemId">
	<li qe id="item-1">
		<input qe type="radio" name="selection"
			qe-tunnel="$parent.$attributes.id into list.selectedItemId if $value">
		First item
	</li>
	<li qe id="item-2">
		<input qe type="radio" name="selection"
			qe-tunnel="$parent.$attributes.id into list.selectedItemId if $value">
		Second item
	</li>
	<li qe id="item-3">
		<input qe type="radio" name="selection"
			qe-tunnel="$parent.$attributes.id into list.selectedItemId if $value">
		Third item
	</li>
</ul>
```

You can get rid of this repetitiveness by using an **"indirect tunnel expression"**

```html
<ul qe="list" qe:aria-activedescendant="selectedItemId"
		qe.id-tunnel="$parent.$attributes.id into list.selectedItemId if $value">
	
	<li qe id="item-1">
		<input qe type="radio" name="selection" qe-tunnel="@idTunnel">
		First item
	</li>
	<li qe id="item-2">
		<input qe type="radio" name="selection" qe-tunnel="@idTunnel">
		Second item
	</li>
	<li qe id="item-3">
		<input qe type="radio" name="selection" qe-tunnel="@idTunnel">
		Third item
	</li>
</ul>
```

An indirect tunnel expression is indicated by `@`, followed by an expression that should evaluate to a string, which is then parsed as the actual tunnel expression.
