export const IN_APP_CHECKOUT_ROUTE = 'checkout';
export const IN_APP_CHECKOUT_PATH = `/subscription/${IN_APP_CHECKOUT_ROUTE}`;

export const CHECKOUT_SANDBOX_KEY = 'checkout.sandbox';

export type SandboxSource = 'shell' | 'settings' | 'none';

export interface CheckoutSandbox {
    readonly on: boolean;
    readonly from: SandboxSource;
}

export const shellSandboxOf = (checkout: object): boolean | undefined => {
    const value: unknown = (checkout as { sandbox?: unknown }).sandbox;
    return typeof value === 'boolean' ? value : undefined;
};

export const checkoutSandbox = (checkout: object, setting: unknown, devBuild: boolean): CheckoutSandbox => {
    const shell = shellSandboxOf(checkout);
    if (shell !== undefined) return { on: shell, from: 'shell' };
    if (devBuild && setting === true) return { on: true, from: 'settings' };
    return { on: false, from: 'none' };
};
