import type { ChannelJoinInput, ChannelUpdateJoinInput, ChatReadInput } from '@lemoncloud/chatic-sockets-api';
import type { DomainJoin, DomainJoinListPayload, DomainListResult } from '../domain';
import { createDomainListResult } from '../domain';
import type { IJoinLocalDataSourceV2 } from '../local/data-sources-v2';
import type { IJoinRemoteDataSource } from '../remote/data-sources';
import type { DataContextProvider } from '../repositories';
import { BaseRepositoryV2, type DisposableRepositoryV2 } from './types';
import type { JoinGetInput, JoinUpdateInput } from '@lemoncloud/chatic-sockets-lib';

export interface IJoinRepositoryV2 extends DisposableRepositoryV2 {
    observeList(
        query: DomainJoinListPayload,
        callback: (result: DomainListResult<DomainJoin> | null) => void
    ): () => void;
    observeItem(id: string, callback: (item: DomainJoin | null) => void): () => void;

    refreshList(query: DomainJoinListPayload): Promise<DomainListResult<DomainJoin>>;
    getJoin(payload: JoinGetInput): Promise<DomainJoin>;
    readChat(payload: ChatReadInput): Promise<DomainJoin>;
    updateJoin(payload: JoinUpdateInput): Promise<DomainJoin>;
    joinChannel(payload: ChannelJoinInput): Promise<DomainJoin>;

    cacheRead(id: string): Promise<DomainJoin | null>;
    cacheReadList(query: DomainJoinListPayload): Promise<DomainListResult<DomainJoin> | null>;
    cacheWrite(item: Partial<DomainJoin>): Promise<void>;
    cacheWriteMany(items: Array<Partial<DomainJoin>>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

/** Maintains join membership snapshots and read-state transitions for each channel context. */
export class JoinRepositoryV2 extends BaseRepositoryV2 implements IJoinRepositoryV2 {
    constructor(
        private readonly joinRemoteDataSource: IJoinRemoteDataSource,
        private readonly joinLocalDataSource: IJoinLocalDataSourceV2,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
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

    /** `join.get`으로 단일 join 스냅샷을 조회해 local cache에 반영합니다. JoinSyncPlan refresh 경로와 UI 단건 갱신에 사용. */
    public async getJoin(payload: JoinGetInput): Promise<DomainJoin> {
        const joinId = this.assertRequiredString(payload.id, 'id');
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const domain = await this.joinRemoteDataSource.getJoin({ id: joinId }, normalizedContext);
        await this.joinLocalDataSource.cacheWrite(domain, requestContext);
        return domain;
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
            const domain = await this.joinRemoteDataSource.readChat(payload, normalizedContext);
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

        // join.update는 단건 composite join id를 요구한다. 앱 입력은 {channelId, userId, notify} 형태일 수
        // 있으므로, 명시 id가 없으면 local cache에서 channelId + userId로 해당 join을 찾아 id를 해석한다.
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
            const domain = await this.joinRemoteDataSource.updateJoin(updateBody, normalizedContext);
            await this.joinLocalDataSource.cacheWrite(domain, requestContext);
            return domain;
        } catch (error) {
            if (existing) {
                await this.joinLocalDataSource.cacheWrite(existing, requestContext);
            }
            throw error;
        }
    }

    public async joinChannel(payload: ChannelJoinInput): Promise<DomainJoin> {
        const channelId = this.assertRequiredString(payload.channelId, 'channelId');
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const optimisticId = `optimistic-join-${channelId}`;
        await this.joinLocalDataSource.cacheWrite(
            {
                id: optimisticId,
                channelId,
                userId: String(requestContext.uid || ''),
                joined: 1,
            },
            requestContext
        );
        try {
            const domain = await this.joinRemoteDataSource.joinChannel(payload, normalizedContext);
            await this.joinLocalDataSource.cacheWrite(domain, requestContext);
            await this.joinLocalDataSource.cacheDelete(optimisticId, requestContext);
            return domain;
        } catch (error) {
            await this.joinLocalDataSource.cacheDelete(optimisticId, requestContext);
            throw error;
        }
    }
}
