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
        IListLocalDataSource<DomainChat, string, DomainListResult<DomainChat>>,
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

    public async upsert(chat: Partial<DomainChat>, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
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
        await this.emitAllStreams();
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
        await this.emitAllStreams();
    }

    public async removeMany(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
        await this.emitAllStreams();
    }

    public async clearAll(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        await this.emitAllStreams();
    }

    // =========================================================================
    // 2. 공통 List 인터페이스 (IListLocalDataSource)
    // =========================================================================

    public async fetchList(
        channelId: string,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainChat> | null> {
        //  채널 ID가 없을 경우 빈 리스트 결과를 반환합니다.
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

        //  조회가 완료되었으나 데이터가 없는 경우 명시적으로 빈 리스트를 반환합니다.
        if (filteredMessages.length === 0) {
            return createDomainListResult([], { total: 0, source: 'local' });
        }

        // 3. 정렬 및 도메인 모델 변환 수행 (Context Scope 주입)
        const list = filteredMessages.sort(sortByOldest).map(item =>
            toDomainChatBase(item, {
                cid: this.getCid(contextOverride),
                sid: this.getSid(contextOverride) || '',
                uid: this.getUid(contextOverride),
            })
        );

        return createDomainListResult(list, {
            total: list.length,
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
        return this.subscribeQueryStream(() => this.fetchList(channelId, contextOverride), callback);
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
        const messages = await this.fetchList(channelId, contextOverride);

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
