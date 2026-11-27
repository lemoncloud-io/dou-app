export interface DataContext {
    cid?: string;
    sid?: string;
    uid?: string;
    socketCid?: string;

    [key: string]: unknown;
}

export interface DataContextProvider {
    getContext(): DataContext;

    setContext(context: DataContext): void;
}
