/**
 * A channel webhook as the settings screen reads it. This is the management view of one issued
 * token — never the token itself: the secret (`Token`) is returned once by `webhook.make-token` and
 * lives only on {@link DomainIssuedWebhook}, which no cache or store keeps.
 */
export interface DomainWebhook {
    id: string;
    channelId: string;
    name: string;
    desc: string;
    /** Paused: the token is refused until it is resumed. */
    paused: boolean;
    /** Epoch ms after which the token is refused; 0 = never expires. */
    expiresAt: number;
    /** Epoch ms of the last message received; 0 = never used. The server stamps it at most once a day. */
    lastUsedAt: number;
    createdAt: number;
}

/** What `webhook.make-token` hands back: the new row plus the one-time secret and the URL to post to. */
export interface DomainIssuedWebhook {
    webhook: DomainWebhook;
    /** Shown once and then dropped — the server never returns it again. */
    token: string;
    /** The endpoint to post to (`Location`); undefined when the server has no endpoint configured. */
    location?: string;
}

/** The slice of the socials `WebhookView` the app reads. Every field is optional on the wire. */
export interface WebhookWireView {
    id?: string;
    channelId?: string;
    name?: string;
    desc?: string;
    disabled?: boolean;
    expiresAt?: number;
    lastUsedAt?: number;
    createdAt?: number;
    Token?: string;
    Location?: string;
}

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

export const toDomainWebhook = (view: WebhookWireView): DomainWebhook => ({
    id: str(view.id),
    channelId: str(view.channelId),
    name: str(view.name),
    desc: str(view.desc),
    paused: view.disabled === true,
    expiresAt: num(view.expiresAt),
    lastUsedAt: num(view.lastUsedAt),
    createdAt: num(view.createdAt),
});

/** Maps an issue response; `undefined` when the server answered without a token. */
export const toDomainIssuedWebhook = (view: WebhookWireView): DomainIssuedWebhook | undefined => {
    if (typeof view.Token !== 'string' || view.Token === '') return undefined;
    return {
        webhook: toDomainWebhook(view),
        token: view.Token,
        location: typeof view.Location === 'string' && view.Location !== '' ? view.Location : undefined,
    };
};

/** An expiry in the past means the token is already refused. 0 means it never expires. */
export const isWebhookExpired = (webhook: Pick<DomainWebhook, 'expiresAt'>, now: number = Date.now()): boolean =>
    webhook.expiresAt > 0 && webhook.expiresAt <= now;
