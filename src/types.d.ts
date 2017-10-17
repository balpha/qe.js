
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

declare interface HTMLElement {
    __qe_scope_id: number;
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

interface IPublicScopeController {
    set(name: string, value: any): void;
    multiSet(name: string, value: any, token?: number) : number;
    unMultiSet(name: string, token: number): void;
    createDelayed<T>(name: string, attach: (setter: ((v: T) => void)) => void, detach: () => void, getCurrentValue: () => T): void;
    tearDown(): void;
    _id: number;
}

interface IPublicScope {
    __qe_controller: IPublicScopeController;
}

interface IDestroyable {
    destroy(): void;
}
