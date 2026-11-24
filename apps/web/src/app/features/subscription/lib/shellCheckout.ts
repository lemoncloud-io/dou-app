export interface ShellCheckoutRequest {
    readonly replace: boolean;
}

export interface ShellCheckoutScreen {
    readonly sandbox: boolean;
    readonly subscriptionWeb?: string;
    bind(open: (request: ShellCheckoutRequest) => void): () => void;
}

export const SHELL_CHECKOUT_ROUTE = 'shell-checkout';
export const SHELL_CHECKOUT_PATH = `/subscription/${SHELL_CHECKOUT_ROUTE}`;

export const shellCheckoutScreen = (checkout: object): ShellCheckoutScreen | null => {
    const screen: unknown = (checkout as { shellScreen?: unknown }).shellScreen;
    if (typeof screen !== 'object' || screen === null) return null;
    const { bind, sandbox } = screen as Partial<ShellCheckoutScreen>;
    return typeof bind === 'function' && typeof sandbox === 'boolean' ? (screen as ShellCheckoutScreen) : null;
};
