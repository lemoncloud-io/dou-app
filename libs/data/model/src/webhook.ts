export interface DomainWebhook {
    id: string;
    channelId: string;
    name: string;
    desc: string;
    paused: boolean;
    expiresAt: number;
    lastUsedAt: number;
    createdAt: number;
}

export interface DomainIssuedWebhook {
    webhook: DomainWebhook;
    token: string;
    location?: string;
}

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

export const toDomainIssuedWebhook = (view: WebhookWireView): DomainIssuedWebhook | undefined => {
    if (typeof view.Token !== 'string' || view.Token === '') return undefined;
    return {
        webhook: toDomainWebhook(view),
        token: view.Token,
        location: typeof view.Location === 'string' && view.Location !== '' ? view.Location : undefined,
    };
};

export const isWebhookExpired = (webhook: Pick<DomainWebhook, 'expiresAt'>, now: number = Date.now()): boolean =>
    webhook.expiresAt > 0 && webhook.expiresAt <= now;
