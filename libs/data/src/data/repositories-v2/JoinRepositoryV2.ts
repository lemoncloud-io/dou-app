import type { ChatReadInput, ChannelJoinInput, ChannelUpdateJoinInput } from '@lemoncloud/chatic-sockets-api';
import type { JoinView } from '@lemoncloud/chatic-socials-api';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import type { DomainJoin, DomainJoinListPayload, DomainListResult } from '../domain';
import { createDomainListResult, toDomainJoin } from '../domain';
import type { IJoinLocalDataSourceV2 } from '../local/data-sources-v2';
import type { IJoinRemoteDataSource } from '../remote/data-sources';
import { BaseRepositoryV2, type DataContextProviderV2, type DisposableRepositoryV2 } from './types';

export interface IJoinRepositoryV2 extends DisposableRepositoryV2 {
    observeList(
        query: DomainJoinListPayload,
        callback: (result: DomainListResult<DomainJoin> | null) => void
    ): () => void;
    observeItem(id: string, callback: (item: DomainJoin | null) => void): () => void;

    refreshList(query: DomainJoinListPayload): Promise<DomainListResult<DomainJoin>>;
    readChat(payload: ChatReadInput): Promise<DomainJoin>;
    updateJoin(payload: ChannelUpdateJoinInput): Promise<DomainJoin>;
    joinChannel(payload: ChannelJoinInput): Promise<DomainJoin>;

    cacheRead(id: string): Promise<DomainJoin | null>;
    cacheReadList(query: DomainJoinListPayload): Promise<DomainListResult<DomainJoin> | null>;
    cacheWrite(item: Partial<DomainJoin>): Promise<void>;
    cacheWriteMany(items: Array<Partial<DomainJoin>>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

/** Maintains join membership snapshots and read-state transitions for each channel scope. */
export class JoinRepositoryV2 extends BaseRepositoryV2 implements IJoinRepositoryV2 {
    constructor(
        private readonly joinRemoteDataSource: IJoinRemoteDataSource,
        private readonly joinLocalDataSource: IJoinLocalDataSourceV2,
        contextProvider: DataContextProviderV2,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(contextProvider, domainEventBus);
        this.initializeInternalListeners();
    }

    public observeList(
        query: DomainJoinListPayload,
        callback: (result: DomainListResult<DomainJoin> | null) => void
    ): () => void {
        return this.joinLocalDataSource.observeList(query, callback, this.getRepositoryContext());
    }

    public observeItem(id: string, callback: (item: DomainJoin | null) => void): () => void {
        return this.joinLocalDataSource.observeItem(id, callback, this.getRepositoryContext());
    }

    public async refreshList(query: DomainJoinListPayload): Promise<DomainListResult<DomainJoin>> {
        this.assertRequiredString(query.channelId, 'channelId');
        return (
            (await this.joinLocalDataSource.cacheReadList(query, this.getRepositoryContext())) ??
            createDomainListResult([], { total: 0, source: 'local' })
        );
    }

    public cacheRead(id: string): Promise<DomainJoin | null> {
        return this.joinLocalDataSource.cacheRead(id, this.getRepositoryContext());
    }

    public cacheReadList(query: DomainJoinListPayload): Promise<DomainListResult<DomainJoin> | null> {
        return this.joinLocalDataSource.cacheReadList(query, this.getRepositoryContext());
    }

    public cacheWrite(item: Partial<DomainJoin>): Promise<void> {
        return this.joinLocalDataSource.cacheWrite(item, this.getRepositoryContext());
    }

    public cacheWriteMany(items: Array<Partial<DomainJoin>>): Promise<void> {
        return this.joinLocalDataSource.cacheWriteMany(items, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.joinLocalDataSource.cacheDelete(id, this.getRepositoryContext());
    }

    public cacheClear(): Promise<void> {
        return this.joinLocalDataSource.cacheClear(this.getRepositoryContext());
    }

    public async readChat(payload: ChatReadInput): Promise<DomainJoin> {
        const channelId = this.assertRequiredString(payload.channelId, 'channelId');
        const context = this.getRepositoryContext();
        const currentList = await this.joinLocalDataSource.cacheReadList({ channelId, activeOnly: false }, context);
        const current = (currentList?.list || []).find(item => item.userId === context.uid);
        const optimisticId = current?.id || `${channelId}:${context.uid || 'me'}`;
        const optimisticPatch: Partial<DomainJoin> = {
            id: optimisticId,
            channelId,
            userId: String(context.uid || ''),
            readNo: payload.chatNo ?? current?.readNo ?? 0,
            chatNo: payload.chatNo,
        };

        await this.joinLocalDataSource.cacheWrite({ ...(current ?? {}), ...optimisticPatch }, context);
        try {
            const remote = (await this.joinRemoteDataSource.readChat(payload)) as JoinView;
            const domain = toDomainJoin(remote, this.getDomainScope());
            await this.joinLocalDataSource.cacheWrite(domain, context);
            return domain;
        } catch (error) {
            if (current) {
                await this.joinLocalDataSource.cacheWrite(current, context);
            }
            throw error;
        }
    }

    public async updateJoin(payload: ChannelUpdateJoinInput): Promise<DomainJoin> {
        const joinId = (payload as { id?: string }).id || '';
        const context = this.getRepositoryContext();
        const existing = joinId ? await this.joinLocalDataSource.cacheRead(joinId, context) : null;
        if (joinId) {
            await this.joinLocalDataSource.cacheWrite({ id: joinId, ...(payload as Partial<DomainJoin>) }, context);
        }
        try {
            const remote = (await this.joinRemoteDataSource.updateJoin(payload)) as JoinView;
            const domain = toDomainJoin(remote, this.getDomainScope());
            await this.joinLocalDataSource.cacheWrite(domain, context);
            return domain;
        } catch (error) {
            if (existing) {
                await this.joinLocalDataSource.cacheWrite(existing, context);
            }
            throw error;
        }
    }

    public async joinChannel(payload: ChannelJoinInput): Promise<DomainJoin> {
        const channelId = this.assertRequiredString(payload.channelId, 'channelId');
        const context = this.getRepositoryContext();
        const optimisticId = `optimistic-join-${channelId}`;
        await this.joinLocalDataSource.cacheWrite(
            {
                id: optimisticId,
                channelId,
                userId: String(context.uid || ''),
                joined: 1,
            },
            context
        );
        try {
            const remote = (await this.joinRemoteDataSource.joinChannel(payload)) as JoinView;
            const domain = toDomainJoin(remote, this.getDomainScope());
            await this.joinLocalDataSource.cacheWrite(domain, context);
            await this.joinLocalDataSource.cacheDelete(optimisticId, context);
            return domain;
        } catch (error) {
            await this.joinLocalDataSource.cacheDelete(optimisticId, context);
            throw error;
        }
    }

    private initializeInternalListeners(): void {
        this.onDomainEvent('join:create', detail => {
            const context = this.getRepositoryContextSnapshot();
            this.runInBackground(() => this.joinLocalDataSource.cacheWrite(detail.data, context), 'join:create');
        });
        this.onDomainEvent('join:update', detail => {
            const context = this.getRepositoryContextSnapshot();
            this.runInBackground(() => this.joinLocalDataSource.cacheWrite(detail.data, context), 'join:update');
        });
        this.onDomainEvent('join:delete', detail => {
            const context = this.getRepositoryContextSnapshot();
            this.runInBackground(
                () => this.joinLocalDataSource.cacheDelete(detail.data.id || '', context),
                'join:delete'
            );
        });
    }
}
