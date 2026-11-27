export interface NodeHostFacts {
    readonly platform: 'node';
    readonly userAgent: string;
}

export interface NodeHostFactsOptions {
    userAgent: string;
}

export const nodeHostFacts =
    ({ userAgent }: NodeHostFactsOptions): (() => NodeHostFacts) =>
    () =>
        Object.freeze({ platform: 'node', userAgent });
