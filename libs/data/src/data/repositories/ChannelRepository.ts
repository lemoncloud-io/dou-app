import {
    BaseRepository,
    type DataContextProvider,
    type ILocalCacheMutationRepository,
    type LocalCacheBulkPatch,
    type RepositoryRequestOptions,
} from './types';
import type { IChannelLocalDataSource } from '../local/data-sources';
import type { IChannelRemoteDataSource } from '../remote/data-sources';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import {
    createDomainListResult,
    type DomainChannel,
    type DomainChannelListPayload,
    type DomainListResult,
    toDomainChannel,
} from '../domain';
import type { ChannelView, ChatView, JoinView } from '@lemoncloud/chatic-socials-api';
import type { ChannelSyncView } from '../events/common';
import type {
    ChatDeleteChannelPayload,
    ChatInvitePayload,
    ChatLeavePayload,
    ChatStartPayload,
    ChatUpdateChannelPayload,
} from '@lemoncloud/chatic-sockets-api';
import type { ListResult } from '../events/common';

/** 채널 도메인의 Repository 공개 계약입니다. */
export interface IChannelRepository extends ILocalCacheMutationRepository<DomainChannel> {
    /** 내가 참여 중인 채널 목록을 조회합니다. */
    fetchChannel(
        payload: DomainChannelListPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainChannel>>;

    /** 채널 이름/설정 등 채널 메타데이터를 수정합니다. */
    updateChannel(payload: ChatUpdateChannelPayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

    /** 채널 삭제 또는 종료 요청을 수행합니다. */
    deleteChannel(payload: ChatDeleteChannelPayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

    /** 신규 채널을 생성하거나 대화를 시작합니다. */
    createChannel(payload: ChatStartPayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

    /** 기존 채널에 사용자를 초대합니다. */
    inviteChannel(payload: ChatInvitePayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

    /** 채널에서 나갑니다. */
    leaveChannel(payload: ChatLeavePayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

    /** 현재 스코프의 channel 로컬 캐시를 초기화합니다. */
    clearAll(): Promise<void>;

    /** 서버로부터 채널 정보 변경(channel:update) 이벤트를 수신하는 리스너를 등록합니다. */
    onChannelUpdated(callback: (channel: DomainChannel) => void): () => void;

    /** 서버로부터 채널 삭제(channel:delete) 이벤트를 수신하는 리스너를 등록합니다. */
    onChannelDeleted(callback: (channel: DomainChannel) => void): () => void;

    /** 서버로부터 신규 채널 생성(channel:create) 이벤트를 수신하는 리스너를 등록합니다. */
    onChannelCreated(callback: (channel: DomainChannel) => void): () => void;

    subscribeList(
        payload: DomainChannelListPayload,
        callback: (result: DomainListResult<DomainChannel> | null) => void
    ): () => void;

    subscribeItem(id: string, callback: (channel: DomainChannel | null) => void): () => void;

    /** 서버와 채널 목록을 동기화합니다. since 이후 변경분만 반영하고 삭제/이탈 채널을 제거합니다. */
    syncChannels(since: number): Promise<{ syncedAt: number; updatedCount: number; removedCount: number }>;
}

export class ChannelRepository extends BaseRepository implements IChannelRepository {
    private readonly leftChannelIds = new Set<string>();

    constructor(
        private readonly channelRemoteDataSource: IChannelRemoteDataSource,
        private readonly channelLocalDataSource: IChannelLocalDataSource,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(contextProvider, domainEventBus);
        this.initializeInternalListeners();
    }

    // --- Remote API ---
    public async fetchChannel(
        payload: DomainChannelListPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainChannel>> {
        return this.fetchWithCachePolicy<DomainListResult<DomainChannel>>({
            options,
            backgroundLabel: 'channel',
            fetchLocal: () => this.channelLocalDataSource.fetchList(payload, this.getRepositoryContext()),
            fetchRemote: remoteOptions => this.fetchFromRemoteAndCache(payload, remoteOptions),
            isLocalValid: local => (local.list || []).length > 0,
            fallback: () => createDomainListResult([], { total: 0, source: 'fallback' }),
        });
    }

    public async updateChannel(
        payload: ChatUpdateChannelPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainChannel> {
        const channel = (await this.channelRemoteDataSource.updateChannel(payload)) as ChannelView;
        const domainChannel = toDomainChannel(channel, this.getDomainScope());
        await this.channelLocalDataSource.upsert(domainChannel, this.getRepositoryContext());
        return domainChannel;
    }

    public async deleteChannel(
        payload: ChatDeleteChannelPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainChannel> {
        const channel = (await this.channelRemoteDataSource.deleteChannel(payload)) as ChannelView;
        const domainChannel = toDomainChannel(channel, this.getDomainScope());
        await this.channelLocalDataSource.remove(
            domainChannel.id || payload.channelId || '',
            this.getRepositoryContext()
        );
        return domainChannel;
    }

    public async createChannel(payload: ChatStartPayload, options?: RepositoryRequestOptions): Promise<DomainChannel> {
        const channel = (await this.channelRemoteDataSource.startChat(payload)) as ChannelView;
        const domainChannel = toDomainChannel(channel, this.getDomainScope());
        await this.channelLocalDataSource.upsert(domainChannel, this.getRepositoryContext());
        return domainChannel;
    }

    public async inviteChannel(payload: ChatInvitePayload, options?: RepositoryRequestOptions): Promise<DomainChannel> {
        const channel = (await this.channelRemoteDataSource.inviteChannel(payload)) as ChannelView;
        const domainChannel = toDomainChannel(channel, this.getDomainScope());
        await this.channelLocalDataSource.upsert(domainChannel, this.getRepositoryContext());
        return domainChannel;
    }

    public async leaveChannel(payload: ChatLeavePayload, options?: RepositoryRequestOptions): Promise<DomainChannel> {
        const channelId = payload.channelId || '';
        if (channelId) {
            this.leftChannelIds.add(channelId);
        }
        try {
            const channel = (await this.channelRemoteDataSource.leaveChannel(payload)) as ChannelView;
            const domainChannel = toDomainChannel(channel, this.getDomainScope());
            await this.channelLocalDataSource.remove(domainChannel.id || channelId, this.getRepositoryContext());
            return domainChannel;
        } catch (error) {
            this.leftChannelIds.delete(channelId);
            throw error;
        }
    }

    public clearAll(): Promise<void> {
        return this.channelLocalDataSource.clearAll(this.getRepositoryContext());
    }

    // --- 개별 이벤트 리스너 ---
    public onChannelUpdated(callback: (channel: DomainChannel) => void): () => void {
        return this.onDomainEvent('channel:update', detail => callback(detail.data as DomainChannel));
    }

    public onChannelDeleted(callback: (channel: DomainChannel) => void): () => void {
        return this.onDomainEvent('channel:delete', detail => callback(detail.data as DomainChannel));
    }

    public onChannelCreated(callback: (channel: DomainChannel) => void): () => void {
        return this.onDomainEvent('channel:create', detail => callback(detail.data as DomainChannel));
    }

    // --- 스트림 인터페이스 ---
    public subscribeList(
        payload: DomainChannelListPayload,
        callback: (result: DomainListResult<DomainChannel> | null) => void
    ): () => void {
        return this.channelLocalDataSource.subscribeList(payload, callback, this.getRepositoryContext());
    }

    public subscribeItem(id: string, callback: (channel: DomainChannel | null) => void): () => void {
        return this.channelLocalDataSource.subscribeItem(id, callback, this.getRepositoryContext());
    }

    // --- Cache Mutations (통합) ---
    public cacheCreate(item: Partial<DomainChannel>): Promise<void> {
        return this.channelLocalDataSource.upsert(item, this.getRepositoryContext());
    }

    public cacheUpdate(id: string, patch: Partial<DomainChannel>): Promise<void> {
        return this.channelLocalDataSource.upsert({ id, ...patch }, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.channelLocalDataSource.remove(id, this.getRepositoryContext());
    }

    public cacheBulkCreate(items: Array<Partial<DomainChannel>>): Promise<void> {
        return this.channelLocalDataSource.upsertMany(items, this.getRepositoryContext());
    }

    public async cacheBulkUpdate(items: Array<LocalCacheBulkPatch<DomainChannel>>): Promise<void> {
        await this.channelLocalDataSource.upsertMany(
            items.map(it => ({ id: it.id, ...it.patch })),
            this.getRepositoryContext()
        );
    }

    // --- Sync Logic ---
    public async syncChannels(
        since: number
    ): Promise<{ syncedAt: number; updatedCount: number; removedCount: number }> {
        const requestScope = this.getDomainScope();
        const requestContext = this.getRepositoryContext();

        const result = (await this.channelRemoteDataSource.syncChannel({ since })) as ChannelSyncView;

        // cloud 전환 감지 — cross-cloud 오염 방지
        const currentCid = this.getRepositoryContext().cid;
        if (currentCid !== requestContext.cid) {
            return { syncedAt: result.syncedAt, updatedCount: 0, removedCount: 0 };
        }

        // 1. 변경된 채널 upsert
        // sync는 클라우드 레벨이므로 sid를 비워서 각 채널 자체의 sid를 보존한다.
        // scope.sid를 그대로 쓰면 $:{} 인 채널에 현재 place의 sid가 오염됨
        const syncScope = { ...requestScope, sid: '' };
        const domainList = (result.list || [])
            .map(item => ({
                ...toDomainChannel(item, syncScope),
                cid: requestScope.cid,
            }))
            .filter(ch => !!ch.sid && !!ch.id && !this.leftChannelIds.has(ch.id));

        if (domainList.length > 0) {
            // sid가 없는 context를 전달하여 upsertMany의 fallback에서 현재 place sid 오염 방지
            const syncContext = { ...requestContext, sid: '' };
            await this.channelLocalDataSource.upsertMany(domainList, syncContext);
        }

        // 2. 삭제/이탈 감지: 로컬에 있지만 서버 ids에 없는 채널 제거
        let removedCount = 0;
        if (result.ids) {
            const activeIds = new Set(result.ids);
            const localResult = await this.channelLocalDataSource.fetchList({}, requestContext);
            const staleIds = (localResult?.list || [])
                .map(ch => ch.id)
                .filter((id): id is string => !!id && !activeIds.has(id));

            if (staleIds.length > 0) {
                await this.channelLocalDataSource.removeMany(staleIds, requestContext);
                removedCount = staleIds.length;
            }
        }

        return { syncedAt: result.syncedAt, updatedCount: domainList.length, removedCount };
    }

    // --- Internal Logic ---
    private async fetchFromRemoteAndCache(
        payload: DomainChannelListPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainChannel>> {
        // 요청 시점의 context를 캡처 — await 중 cloud 전환이 발생해도 올바른 scope에 캐시 저장
        const requestScope = this.getDomainScope();
        const requestContext = this.getRepositoryContext();

        const remote = (await this.channelRemoteDataSource.fetchChannel(payload)) as ListResult<ChannelView>;
        // 서버 응답의 cid(e.g. "global")는 cloud 파티셔닝 기준과 다를 수 있으므로
        // requestScope.cid(= 요청 시점의 cloudId)로 강제 대체
        const domainList = (remote.list || []).map(item => ({
            ...toDomainChannel(item, requestScope),
            cid: requestScope.cid,
        }));

        // cloud가 전환되었으면 캐시 저장 스킵 — cross-cloud 오염 방지
        const currentCid = this.getRepositoryContext().cid;
        if (currentCid === requestContext.cid) {
            const filteredList = domainList.filter(ch => !ch.id || !this.leftChannelIds.has(ch.id));
            await this.channelLocalDataSource.upsertMany(filteredList, requestContext);

            // Reconciliation: 서버 응답에 없는 로컬 캐시 채널 제거
            const serverIds = new Set(filteredList.map(ch => ch.id).filter(Boolean));
            const localResult = await this.channelLocalDataSource.fetchList(payload, requestContext);
            const staleIds = (localResult?.list || [])
                .map(ch => ch.id)
                .filter((id): id is string => !!id && !serverIds.has(id));
            if (staleIds.length > 0) {
                await this.channelLocalDataSource.removeMany(staleIds, requestContext);
            }
        }

        return createDomainListResult(domainList, {
            total: remote.total ?? domainList.length,
            limit: remote.limit,
            page: remote.page,
            source: 'remote',
        });
    }

    private initializeInternalListeners(): void {
        this.onDomainEvent('channel:create', detail => {
            const createdId = detail.data.id || '';
            if (createdId) this.leftChannelIds.delete(createdId);
            this.runInBackground(
                () => this.channelLocalDataSource.upsert(detail.data, this.getRepositoryContext()),
                'channel:create'
            );
        });
        this.onDomainEvent('channel:update', detail => {
            const channelId = detail.data.id || '';
            if (channelId && this.leftChannelIds.has(channelId)) {
                return;
            }
            this.runInBackground(
                () => this.channelLocalDataSource.upsert(detail.data, this.getRepositoryContext()),
                'channel:update'
            );
        });
        this.onDomainEvent('channel:delete', detail =>
            this.runInBackground(
                () => this.channelLocalDataSource.remove(detail.data.id || '', this.getRepositoryContext()),
                'channel:delete'
            )
        );

        // 새 메시지 수신 시 해당 채널의 lastChat$/chatNo/unreadCount를 캐시에 즉시 반영
        this.onDomainEvent('chat:create', detail => {
            const chat = detail.data as ChatView;
            const channelId = chat.channelId;
            if (!channelId) return;

            this.runInBackground(async () => {
                const context = this.getRepositoryContext();
                const existing = await this.channelLocalDataSource.getById(channelId, context);
                if (!existing) return;

                const isOwnMessage = !!context.uid && chat.ownerId === context.uid;
                const prevUnread = existing.unreadCount ?? 0;

                await this.channelLocalDataSource.upsert(
                    {
                        id: channelId,
                        lastChat$: chat,
                        chatNo: chat.chatNo,
                        unreadCount: isOwnMessage ? prevUnread : prevUnread + 1,
                    } as unknown as Partial<DomainChannel>,
                    context
                );
            }, 'chat:create→channel:update');
        });

        // 읽음 처리(join:update) 시 채널 캐시의 $join을 즉시 반영
        this.onDomainEvent('join:update', detail => {
            const join = detail.data as JoinView;
            const channelId = (join as { channelId?: string }).channelId;
            if (!channelId) return;

            const context = this.getRepositoryContext();
            const isMyJoin = !!context.uid && (join as { userId?: string }).userId === context.uid;
            if (!isMyJoin) return;

            this.runInBackground(async () => {
                const existing = await this.channelLocalDataSource.getById(channelId, context);
                if (!existing) return;

                // $join 갱신 + unreadCount 재계산
                const lastChatNo =
                    (existing.lastChat$ as { chatNo?: number } | undefined)?.chatNo ?? existing.chatNo ?? 0;
                const myReadNo = (join as { chatNo?: number }).chatNo ?? 0;
                const unreadCount = Math.max(0, lastChatNo - myReadNo);

                await this.channelLocalDataSource.upsert(
                    { id: channelId, $join: join, unreadCount } as unknown as Partial<DomainChannel>,
                    context
                );
            }, 'join:update→channel:$join');
        });
    }
}
