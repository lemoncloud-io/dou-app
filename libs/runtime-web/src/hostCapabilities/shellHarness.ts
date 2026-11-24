export const SHELL_HARNESS_GLOBAL = 'CHATIC_SHELL_HARNESS';

export interface ShellHarness {
    readonly version: 1;
    readonly sandbox: boolean;
    readonly subscriptionWeb?: string;
}

const originOf = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : undefined;
    } catch {
        return undefined;
    }
};

export const readShellHarness = (
    page: object | undefined,
    { productionBuild }: { productionBuild: boolean }
): ShellHarness | null => {
    if (productionBuild || !page) return null;
    const value: unknown = (page as Record<string, unknown>)[SHELL_HARNESS_GLOBAL];
    if (typeof value !== 'object' || value === null) return null;
    const { version, sandbox, subscriptionWeb } = value as Record<string, unknown>;
    if (version !== 1 || typeof sandbox !== 'boolean') return null;
    const origin = originOf(subscriptionWeb);
    return origin ? { version, sandbox, subscriptionWeb: origin } : { version, sandbox };
};

export const shellCheckoutUrl = (url: string, harness: ShellHarness): string => {
    const target = new URL(url);
    const moved = harness.subscriptionWeb
        ? new URL(`${target.pathname}${target.search}`, harness.subscriptionWeb)
        : target;
    if (harness.sandbox) moved.searchParams.set('sandbox', '1');
    return moved.toString();
};
