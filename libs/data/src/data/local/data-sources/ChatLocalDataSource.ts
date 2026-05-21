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
import type { CacheChatView } from '@chatic/app-messages';
import { logger } from '@chatic/app-messages';

type ChatCache = CacheStorageItem<'chat'>;
type ChatSortable = Partial<DomainChat> | ChatCache;

const getChatNo = (chat: ChatSortable): number | undefined => {
    const chatNo = (chat as { chatNo?: number }).chatNo;
    return typeof chatNo === 'number' ? chatNo : undefined;
};

export interface IChatLocalDataSource
    extends ICrudLocalDataSource<DomainChat>,
        IListLocalDataSource<DomainChat, ChatFeedPayload, DomainListResult<DomainChat>>,
        IStreamLocalDataSource<DomainChat, string, DomainListResult<DomainChat>> {}

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
        this.debouncedEmitAllStreams();
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
        const { channelId, limit } = payload;

        if (!channelId) {
            return createDomainListResult([], { total: 0, source: 'local' });
        }

        // 스토리지 계층에 쿼리 옵션을 위임하여 필터링/정렬/페이징된 결과를 직접 받아옵니다.
        const pageList: CacheChatView[] = await this.cacheStorage.loadAll({ ...payload, limit });

        logger.info('CACHE', `[ChatLocal:fetchList] channelId=${channelId}, loaded=${pageList.length}`);

        if (pageList.length === 0) {
            return createDomainListResult([], { total: 0, source: 'local' });
        }

        // 반환된 개수가 limit과 같다면 다음 페이지가 있을 것으로 간주하고 커서 번호를 설정합니다.
        let nextCursorNo: number | undefined = undefined;
        if (pageList.length === limit) {
            nextCursorNo = getChatNo(pageList[0]);
        }

        const list = pageList.map(item =>
            toDomainChatBase(item, {
                cid: this.getCid(contextOverride),
                sid: this.getSid(contextOverride) || '',
                uid: this.getUid(contextOverride),
            })
        );

        return createDomainListResult(list, {
            total: pageList.length,
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
}
