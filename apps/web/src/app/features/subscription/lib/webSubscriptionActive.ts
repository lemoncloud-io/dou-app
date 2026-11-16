/** `code` carried by `WebSubscriptionActiveError`, the same way a store failure carries `user-cancelled`. */
export const WEB_SUBSCRIPTION_ACTIVE = 'web-subscription-active';

/**
 * The relay refused a store receipt because a website subscription is running. Typed so the screens
 * branch on `code` instead of parsing a message, and so it is never filed as a payment failure.
 */
export class WebSubscriptionActiveError extends Error {
    readonly code = WEB_SUBSCRIPTION_ACTIVE;

    constructor(message = 'web subscription is active') {
        super(message);
        this.name = 'WebSubscriptionActiveError';
    }
}

export const isWebSubscriptionActiveError = (e: unknown): boolean =>
    e instanceof WebSubscriptionActiveError || (e as { code?: unknown } | null)?.code === WEB_SUBSCRIPTION_ACTIVE;

/**
 * Whether a failed `POST /memberships/0` is that refusal: `409 CONFLICT - <provider> subscription is
 * active`. A 409 alone is not enough — the status can come from elsewhere — so the message must say
 * the subscription is active. Status and message are each read from wherever the HTTP layer put them.
 */
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
