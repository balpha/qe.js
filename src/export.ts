interface QE {
    Scope(parent?: IPublicScope, name?: string) : IPublicScope;
    
    Expression<T>(exp: string, scope: IPublicScope, callback: (v: T) => void): void;
    Expression<T>(exp: string, scope: IPublicScope, callback: (v: T) => void, onDestroy: () => void): IDestroyable;
    
    Tunnel<T>(scope: IPublicScope, definition: string): void;
    Tunnel<T>(scope: IPublicScope, definition: string, onDestroy: () => void): IDestroyable;
    
    onException(f: (expression: string, exception: Error) => void) : void;
    logPendingExceptions(): void;
    logExceptionsToConsole(yesno: boolean): void;
    
    register(name: string, componentData: IComponent): void;
    init(): void;
}

var QE = (window as any).QE = {} as QE;