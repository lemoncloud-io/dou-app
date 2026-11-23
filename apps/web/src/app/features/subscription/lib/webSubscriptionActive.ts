export const WEB_SUBSCRIPTION_ACTIVE = 'web-subscription-active';

export class WebSubscriptionActiveError extends Error {
    readonly code = WEB_SUBSCRIPTION_ACTIVE;

    constructor(message = 'web subscription is active') {
        super(message);
        this.name = 'WebSubscriptionActiveError';
    }
}

export const isWebSubscriptionActiveError = (e: unknown): boolean =>
    e instanceof WebSubscriptionActiveError || (e as { code?: unknown } | null)?.code === WEB_SUBSCRIPTION_ACTIVE;

export const asWebSubscriptionActive = (e: unknown): WebSubscriptionActiveError | undefined => {
    if (e instanceof WebSubscriptionActiveError) return e;
    const err = e as {
        status?: number;
        response?: { status?: number; data?: { message?: unknown } };
        message?: unknown;
    } | null;
    const text = [err?.message, err?.response?.data?.message].filter(m => typeof m === 'string').join(' ');
    const status = err?.status ?? err?.response?.status;
    const conflict = status === 409 || /\b409\b/.test(text);
    return conflict && /subscription is active/i.test(text) ? new WebSubscriptionActiveError(text) : undefined;
};
