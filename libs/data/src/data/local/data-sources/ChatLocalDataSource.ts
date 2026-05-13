import {
    BaseLocalDataSource,
    type ICrudLocalDataSource,
    type IListLocalDataSource,
    type IStreamLocalDataSource,
    type LocalDataSourceContextOverride,
    type LocalStreamCallback,
    type LocalStreamUnsubscribe,
} from './types';
import type { DataContextProvider } from '../../repositories';
import type { CacheStorage, CacheStorageItem } from '../storages';
import type { DomainChat, DomainListResult } from '../../domain';
import { createDomainListResult } from '../../domain';
import { toDomainChat as toDomainChatBase } from '../../domain';
import type { ChatFeedPayload } from '@lemoncloud/chatic-sockets-api';
import { resolveScopedContext } from '../storages/utils';
import { logger } from '@chatic/app-messages';

type ChatCache = CacheStorageItem<'chat'>;
type ChatSortable = Partial<DomainChat> | ChatCache;

const getChatNo = (chat: ChatSortable): number | undefined => {
    const chatNo = (chat as { chatNo?: number }).chatNo;
    return typeof chatNo === 'number' ? chatNo : undefined;
};

const getChatSortTime = (chat: ChatSortable): number => {
    const createdAt = (chat as { createdAt?: string | number }).createdAt;
    if (typeof createdAt === 'number') return createdAt;
    if (createdAt) return new Date(createdAt).getTime();
    return 0;
};

const sortByNewest = (left: ChatSortable, right: ChatSortable): number => {
    const leftNo = getChatNo(left);
    const rightNo = getChatNo(right);
    if (leftNo !== undefined && rightNo !== undefined) return rightNo - leftNo;
    if (leftNo !== undefined) return -1;
    if (rightNo !== undefined) return 1;
    return getChatSortTime(right) - getChatSortTime(left);
};

const sortByOldest = (left: ChatSortable, right: ChatSortable): number => -sortByNewest(left, right);

export interface IChatLocalDataSource
    extends ICrudLocalDataSource<DomainChat>,
        IListLocalDataSource<DomainChat, ChatFeedPayload, DomainListResult<DomainChat>>,
        IStreamLocalDataSource<DomainChat, string, DomainListResult<DomainChat>> {
    /** 채널 메시지의 연속성(누락 구간)을 검사합니다. */
    checkContinuity(
        channelId: string,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<{ hasGap: boolean; missingRanges: Array<{ from: number; to: number }> }>;
}

export class ChatLocalDataSource extends BaseLocalDataSource implements IChatLocalDataSource {
    constructor(
        protected override readonly contextProvider: DataContextProvider,
        protected readonly cacheStorage: CacheStorage<'chat'>
    ) {
        super(contextProvider);
    }

    // =========================================================================
    // 1. 공통 CRUD 인터페이스 (ICrudLocalDataSource)
    // =========================================================================

    public async getById(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<DomainChat | null> {
        if (!id) return null;
        const item = await this.cacheStorage.load(id);
        return item ? toDomainChatBase(item, {} as any) : null; // scope 파라미터는 프로젝트 환경에 맞게 주입 필요
    }

    public async upsert(
        chat: Partial<DomainChat>,
        contextOverride?: LocalDataSourceContextOverride,
        emitStream = true
    ): Promise<void> {
        const id = chat.id;
        if (!id) return;

        const context = this.getContext(contextOverride);
        const existing = await this.cacheStorage.load(id);

        // 기존 데이터를 불러와 병합하므로 updateChatPartial의 역할을 완전히 대체합니다.
        const normalized = toDomainChatBase(
            {
                ...(existing ?? {}),
                ...(chat as Record<string, unknown>),
                cid: context.cid || this.getCid(contextOverride),
            } as Partial<DomainChat>,
            {
                cid: context.cid || this.getCid(contextOverride),
                sid: context.sid,
                uid: context.uid,
            }
        );

        await this.cacheStorage.save(id, normalized as ChatCache);
        if (emitStream) {
            this.debouncedEmitAllStreams();
        }
    }

    public async upsertMany(
        chats: Array<Partial<DomainChat>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const validChats = chats.filter(chat => chat.id);
        if (validChats.length === 0) return;

        const context = this.getContext(contextOverride);
        const cid = context.cid || this.getCid(contextOverride);
        const scope = { cid, sid: context.sid || '', uid: context.uid };

        const normalized = validChats.map(
            chat => toDomainChatBase({ ...(chat as Record<string, unknown>), cid }, scope) as ChatCache
        );

        // 🔍 DEBUG: trace scope used by saveAll
        const debugSaveScope = resolveScopedContext('chat', this.contextProvider);
        logger.info(
            'CACHE',
            `[ChatLocal:upsertMany] count=${normalized.length}, scope={cid:${debugSaveScope.cid}, uid:${debugSaveScope.uid}}`
        );

        // 단일 IndexedDB 트랜잭션으로 배치 저장 후 구독자에게 한 번만 알림
        await this.cacheStorage.saveAll(normalized);
        await this.emitAllStreams();
    }

    public async remove(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
        this.debouncedEmitAllStreams();
    }

    public async removeMany(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
        this.debouncedEmitAllStreams();
    }

    public async clearAll(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        this.debouncedEmitAllStreams();
    }

    // =========================================================================
    // 2. 공통 List 인터페이스 (IListLocalDataSource)
    // =========================================================================

    public async fetchList(
        payload: ChatFeedPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainChat> | null> {
        const { channelId, cursorNo, limit = 50 } = payload;

        if (!channelId) {
            return createDomainListResult([], { total: 0, source: 'local' });
        }

        // 🔍 DEBUG: trace scope used by loadAll
        const debugScope = resolveScopedContext('chat', this.contextProvider);
        const debugCtx = this.contextProvider.getContext();

        const allMessages = await this.cacheStorage.loadAll();
        const filteredMessages = allMessages.filter(chat => chat.channelId === channelId);

        logger.info(
            'CACHE',
            `[ChatLocal:fetchList] channelId=${channelId}, scope={cid:${debugScope.cid}, uid:${debugScope.uid}}, ctx={cid:${debugCtx.cid}, uid:${debugCtx.uid}}, loadAll=${allMessages.length}, filtered=${filteredMessages.length}`
        );

        if (filteredMessages.length === 0) {
            return createDomainListResult([], { total: 0, source: 'local' });
        }

        // 최신 메시지가 뒤로 가도록 정렬 (chatNo 오름차순)
        const sortedMessages = filteredMessages.sort(sortByOldest);

        let pageList: ChatCache[];
        let nextCursorNo: number | undefined = undefined;

        if (cursorNo === undefined || cursorNo === 0) {
            // 첫 페이지 요청 (가장 최신 메시지)
            const startIndex = Math.max(0, sortedMessages.length - limit);
            pageList = sortedMessages.slice(startIndex);
        } else {
            // 특정 커서 기준 이전 페이지 요청
            const cursorIndex = sortedMessages.findIndex(chat => getChatNo(chat) === cursorNo);

            if (cursorIndex === -1) {
                // 캐시에 해당 커서가 없으면 빈 결과를 반환하여 remote fetch를 유도
                return createDomainListResult([], { total: 0, source: 'local' });
            }

            const startIndex = Math.max(0, cursorIndex - limit);
            pageList = sortedMessages.slice(startIndex, cursorIndex);
        }

        // 다음 페이지를 위한 커서 계산
        if (pageList.length > 0) {
            const oldestMessageInPage = pageList[0];
            const oldestChatNo = getChatNo(oldestMessageInPage);
            // 현재 페이지의 가장 오래된 메시지 chatNo가 전체에서 가장 오래된 메시지의 chatNo와 같지 않다면, 더 이전 페이지가 존재함
            if (oldestChatNo !== getChatNo(sortedMessages[0])) {
                nextCursorNo = oldestChatNo;
            }
        }

        const list = pageList.map(item =>
            toDomainChatBase(item, {
                cid: this.getCid(contextOverride),
                sid: this.getSid(contextOverride) || '',
                uid: this.getUid(contextOverride),
            })
        );

        return createDomainListResult(list, {
            total: sortedMessages.length,
            cursorNo: nextCursorNo,
            limit,
            source: 'local',
        });
    }

    // =========================================================================
    // 3. 공통 Stream 인터페이스 (IStreamLocalDataSource)
    // =========================================================================

    public subscribeList(
        channelId: string,
        callback: LocalStreamCallback<DomainListResult<DomainChat> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        // fetchList의 인자 타입이 변경되었으므로, 여기서는 channelId만으로 호출할 수 없습니다.
        // subscribeList는 전체 목록을 스트리밍하는 역할이므로, 페이징 없이 모든 데이터를 가져오도록 payload를 구성합니다.
        const payload: ChatFeedPayload = { channelId };
        return this.subscribeQueryStream(() => this.fetchList(payload, contextOverride), callback);
    }

    public subscribeItem(
        id: string,
        callback: LocalStreamCallback<DomainChat | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.getById(id, contextOverride), callback);
    }

    // =========================================================================
    // 4. 도메인 특수 로직
    // =========================================================================

    public async checkContinuity(
        channelId: string,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<{ hasGap: boolean; missingRanges: Array<{ from: number; to: number }> }> {
        const messages = await this.fetchList({ channelId }, contextOverride);

        const chatNos = (messages?.list || [])
            .map(getChatNo)
            .filter((chatNo): chatNo is number => chatNo !== undefined)
            .sort((a, b) => a - b);

        if (chatNos.length < 2) {
            return { hasGap: false, missingRanges: [] };
        }

        const missingRanges: Array<{ from: number; to: number }> = [];
        for (let index = 1; index < chatNos.length; index += 1) {
            const previous = chatNos[index - 1];
            const current = chatNos[index];
            if (current - previous <= 1) continue;
            missingRanges.push({ from: previous + 1, to: current - 1 });
        }

        return {
            hasGap: missingRanges.length > 0,
            missingRanges,
        };
    }
}
