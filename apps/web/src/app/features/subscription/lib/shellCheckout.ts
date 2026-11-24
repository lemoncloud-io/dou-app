export interface ShellCheckoutRequest {
    readonly url: string;
    readonly replace: boolean;
}

export interface ShellCheckoutScreen {
    bind(open: (request: ShellCheckoutRequest) => void): () => void;
}

export const shellCheckoutScreen = (checkout: object): ShellCheckoutScreen | null => {
    const screen: unknown = (checkout as { shellScreen?: unknown }).shellScreen;
    return typeof screen === 'object' && screen !== null && typeof (screen as ShellCheckoutScreen).bind === 'function'
        ? (screen as ShellCheckoutScreen)
        : null;
};
