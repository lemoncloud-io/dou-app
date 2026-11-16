import type { DomainIssuedWebhook, DomainWebhook } from '../domain';
import { toDomainIssuedWebhook, toDomainWebhook } from '../domain';
import type { IWebhookSocketDataSource } from '../remote/socket-data-sources';
import type { DataContextProvider, DisposableRepository } from './types';
import { BaseRepository } from './types';

/** `webhook.list` page size. A channel rarely holds more tokens than this. */
const LIST_LIMIT = 50;

export interface WebhookIssueInput {
    name?: string;
    desc?: string;
    /** Epoch ms the token stops working; 0 or omitted = never. */
    expiresAt?: number;
}

export interface IWebhookRepository extends DisposableRepository {
    /** The channel's live webhooks, newest first as the server orders them. */
    list(channelId: string): Promise<DomainWebhook[]>;
    /** Issues a token. The secret is on the result only — this repository keeps nothing. */
    issue(channelId: string, input?: WebhookIssueInput): Promise<DomainIssuedWebhook>;
    /** Pauses (`true`) or resumes (`false`) a webhook. Resolves when the server accepted it. */
    setPaused(id: string, paused: boolean): Promise<void>;
    /** Sets the expiry; 0 = never. Resolves when the server accepted it. */
    setExpiresAt(id: string, expiresAt: number): Promise<void>;
    remove(id: string): Promise<void>;
}

/**
 * Channel webhook management. Remote-only, with no cache: the list is read when the settings section
 * opens and a token is shown once, so there is nothing to keep — which is also what keeps the secret
 * out of every store and log.
 */
export class WebhookRepository extends BaseRepository implements IWebhookRepository {
    constructor(
        private readonly dataSource: IWebhookSocketDataSource,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    public async list(channelId: string): Promise<DomainWebhook[]> {
        const result = await this.dataSource.list({ channelId, page: 0, limit: LIST_LIMIT });
        return (result.list ?? []).map(toDomainWebhook);
    }

    public async issue(channelId: string, input: WebhookIssueInput = {}): Promise<DomainIssuedWebhook> {
        const view = await this.dataSource.makeToken({ channelId, ...input });
        const issued = toDomainIssuedWebhook(view);
        // Reject without echoing the view: an answer with no token must not be able to log anything.
        if (!issued) throw new Error('webhook.make-token answered without a token');
        return issued;
    }

    // The write answers are not mapped: the caller already knows the value it asked for, and a
    // partial answer (the server may omit `lastUsedAt` on an update) would overwrite what the list holds.
    public async setPaused(id: string, paused: boolean): Promise<void> {
        await this.dataSource.update({ id, disabled: paused });
    }

    public async setExpiresAt(id: string, expiresAt: number): Promise<void> {
        await this.dataSource.update({ id, expiresAt });
    }

    public async remove(id: string): Promise<void> {
        await this.dataSource.delete({ id });
    }
}
