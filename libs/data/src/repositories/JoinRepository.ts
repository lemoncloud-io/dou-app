import type { ChannelUpdateJoinInput, ChatReadInput } from '@lemoncloud/chatic-sockets-api';
import type { DomainJoin, DomainJoinListPayload, DomainListResult } from '../domain';
import type { IJoinLocalDataSource } from '../local/data-sources';
import type { IJoinSocketDataSource } from '../remote/socket-data-sources';
import type { DataContext, DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';
import type { JoinUpdateInput } from '@lemoncloud/chatic-sockets-lib';

export interface IJoinRepository extends DisposableRepository {
    observeList(
        query: DomainJoinListPayload,
        callback: (result: DomainListResult<DomainJoin> | null) => void,
        contextOverride?: DataContext
    ): () => void;

    readChat(payload: ChatReadInput): Promise<DomainJoin>;
    updateJoin(payload: JoinUpdateInput): Promise<DomainJoin>;

    cacheReadList(query: DomainJoinListPayload): Promise<DomainListResult<DomainJoin> | null>;
    cacheWrite(item: Partial<DomainJoin>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

/** Maintains join membership snapshots and read-state transitions for each channel context. */
export class JoinRepository extends BaseRepository implements IJoinRepository {
    constructor(
        private readonly joinSocketDataSource: IJoinSocketDataSource,
        private readonly joinLocalDataSource: IJoinLocalDataSource,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    public observeList(
        query: DomainJoinListPayload,
        callback: (result: DomainListResult<DomainJoin> | null) => void,
        contextOverride?: DataContext
    ): () => void {
        return this.joinLocalDataSource.observeList(query, callback, contextOverride ?? this.getRepositoryContext());
    }

    public cacheReadList(query: DomainJoinListPayload): Promise<DomainListResult<DomainJoin> | null> {
        return this.joinLocalDataSource.cacheReadList(query, this.getRepositoryContext());
    }

    public cacheWrite(item: Partial<DomainJoin>): Promise<void> {
        return this.joinLocalDataSource.cacheWrite(item, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.joinLocalDataSource.cacheDelete(id, this.getRepositoryContext());
    }

    public cacheClear(): Promise<void> {
        return this.joinLocalDataSource.cacheClear(this.getRepositoryContext());
    }

    public async readChat(payload: ChatReadInput): Promise<DomainJoin> {
        const channelId = this.assertRequiredString(payload.channelId, 'channelId');
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const currentList = await this.joinLocalDataSource.cacheReadList(
            { channelId, activeOnly: false },
            requestContext
        );
        const current = (currentList?.list || []).find(item => item.userId === requestContext.uid);
        const optimisticId = current?.id || `${channelId}@${requestContext.uid || 'me'}`;
        const optimisticPatch: Partial<DomainJoin> = {
            id: optimisticId,
            channelId,
            userId: String(requestContext.uid || ''),
            readNo: payload.chatNo ?? current?.readNo ?? 0,
            chatNo: payload.chatNo,
        };

        await this.joinLocalDataSource.cacheWrite({ ...(current ?? {}), ...optimisticPatch }, requestContext);
        try {
            const domain = await this.joinSocketDataSource.readChat(payload, normalizedContext);
            await this.joinLocalDataSource.cacheWrite(domain, requestContext);
            return domain;
        } catch (error) {
            if (current) {
                await this.joinLocalDataSource.cacheWrite(current, requestContext);
            }
            throw error;
        }
    }

    public async updateJoin(payload: ChannelUpdateJoinInput): Promise<DomainJoin> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);

        // `join.update` requires a single composite join id. App input can arrive as
        // {channelId, userId, notify}, so when no explicit id is given the join is looked up in the
        // local cache by channelId + userId to resolve one.
        const channelId = (payload as { channelId?: string }).channelId || '';
        const targetUserId = (payload as { userId?: string }).userId || String(requestContext.uid || '');
        let joinId = (payload as { id?: string }).id || (payload as { joinId?: string }).joinId || '';
        let existing = joinId ? await this.joinLocalDataSource.cacheRead(joinId, requestContext) : null;
        if (!joinId && channelId) {
            const list = await this.joinLocalDataSource.cacheReadList({ channelId, activeOnly: false }, requestContext);
            existing = (list?.list || []).find(item => item.userId === targetUserId) || null;
            joinId = existing?.id || '';
        }
        const resolvedId = this.assertRequiredString(joinId, 'id');

        const { nick, notify } = payload as { nick?: string; notify?: ChannelUpdateJoinInput['notify'] };
        const updateBody = {
            id: resolvedId,
            ...(typeof nick === 'string' ? { nick } : {}),
            ...(typeof notify !== 'undefined' ? { notify } : {}),
        };

        await this.joinLocalDataSource.cacheWrite(
            { ...(existing ?? {}), ...(updateBody as Partial<DomainJoin>) },
            requestContext
        );
        try {
            const domain = await this.joinSocketDataSource.updateJoin(updateBody, normalizedContext);
            await this.joinLocalDataSource.cacheWrite(domain, requestContext);
            return domain;
        } catch (error) {
            if (existing) {
                await this.joinLocalDataSource.cacheWrite(existing, requestContext);
            }
            throw error;
        }
    }
}
