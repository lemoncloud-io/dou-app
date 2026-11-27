import type { DomainIssuedWebhook, DomainWebhook } from '@chatic/data-model';
import { toDomainIssuedWebhook, toDomainWebhook } from '@chatic/data-model';
import type { IWebhookSocketDataSource } from '@chatic/data-api';
import type { DataContextProvider, DisposableRepository } from './types';
import { BaseRepository } from './types';

const LIST_LIMIT = 50;

export interface WebhookIssueInput {
    name?: string;
    desc?: string;
    expiresAt?: number;
}

export interface IWebhookRepository extends DisposableRepository {
    list(channelId: string): Promise<DomainWebhook[]>;
    issue(channelId: string, input?: WebhookIssueInput): Promise<DomainIssuedWebhook>;
    setPaused(id: string, paused: boolean): Promise<void>;
    setExpiresAt(id: string, expiresAt: number): Promise<void>;
    remove(id: string): Promise<void>;
}

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
        if (!issued) throw new Error('webhook.make-token answered without a token');
        return issued;
    }

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
