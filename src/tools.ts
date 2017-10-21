var _hasOwnProperty = Object.prototype.hasOwnProperty;
function objectHasOwnProperty(obj: object, prop: string) {
    return _hasOwnProperty.call(obj, prop);
}

function newObject() {
    return Object.create(null);
}
