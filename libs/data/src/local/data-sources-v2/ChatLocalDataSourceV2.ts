import type { ChatFeedInput } from '@lemoncloud/chatic-sockets-api';
import type { CacheChatView, ChatQueryOptions, LastChatItem } from '@chatic/app-messages';
import type { DomainChat, DomainLastChat, DomainListResult } from '../../domain';
import { createDomainListResult, isPreviewableChat, pickPreviewChat } from '../../domain';
import type { DataContextProvider } from '../../repositories-v2/types';
import type { CacheStorage } from '../ports';
import {
    BaseLocalDataSourceV2,
    type ILocalDataSourceV2,
    type LocalDataSourceV2Callback,
    type LocalDataSourceV2ContextOverride,
    type LocalDataSourceV2Unsubscribe,
} from './types';

const getChatNo = (chat: Partial<DomainChat> | CacheChatView): number | undefined => {
    const chatNo = (chat as { chatNo?: number }).chatNo;
    return typeof chatNo === 'number' ? chatNo : undefined;
};

export interface IChatLocalDataSourceV2
    extends ILocalDataSourceV2<DomainChat, ChatFeedInput, DomainListResult<DomainChat>> {
    cacheClearByChannelId(channelId: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void>;
    cacheReadLastList(
        channelIds: string[],
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainLastChat[]>;
    observeLastList(
        channelIds: string[],
        callback: LocalDataSourceV2Callback<DomainLastChat[]>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe;
}

/**
 * 폴백 윈도우 깊이. 최신 행들이 프리뷰 불가(리액션 burst 등)여도 그 아래의 진짜 메시지를
 * 찾을 만큼 — 홈 행별 구독 시절의 `PREVIEW_LOOKBACK`(ADR-0047 결정 3)과 같은 근거의 값입니다.
 */
const LAST_CHAT_FALLBACK_LOOKBACK = 30;

/** Stores chat pages locally and re-emits only the channel timelines touched by each write. */
export class ChatLocalDataSourceV2 extends BaseLocalDataSourceV2 implements IChatLocalDataSourceV2 {
    constructor(
        contextProvider: DataContextProvider,
        private readonly cacheStorage: CacheStorage<'chat'>
    ) {
        super(contextProvider);
    }

    public async cacheRead(
        id: string,
        _contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainChat | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        return this.cacheStorage.load(requiredId);
    }

    public async cacheReadList(
        query: ChatFeedInput,
        _contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainListResult<DomainChat> | null> {
        const channelId = this.assertRequiredString(query?.channelId, 'channelId');
        const { limit = 50 } = query;

        const pageList = await this.cacheStorage.loadAll({
            ...query,
            channelId,
            limit,
        } as ChatQueryOptions);

        if (pageList.length === 0) {
            return createDomainListResult([], { total: 0, limit, source: 'local' });
        }

        let nextCursorNo: number | undefined;
        if (pageList.length === limit) {
            nextCursorNo = getChatNo(pageList[0]);
        }

        return createDomainListResult(pageList, {
            total: pageList.length,
            cursorNo: nextCursorNo,
            limit,
            source: 'local',
        });
    }

    public observeItem(
        id: string,
        callback: LocalDataSourceV2Callback<DomainChat | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id, contextOverride), callback, contextOverride);
    }

    public observeList(
        query: ChatFeedInput,
        callback: LocalDataSourceV2Callback<DomainListResult<DomainChat> | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeListQuery(
            this.getListKey(query, contextOverride),
            () => this.cacheReadList(query, contextOverride),
            callback
        );
    }

    /**
     * 채널 목록의 "마지막 메시지 프리뷰" 일괄 읽기 (ADR-0057).
     *
     * fast path는 저장소의 `loadLastPerChannel`(네이티브: 브릿지 왕복 1회). 판정(SQL)은
     * 최적화일 뿐 의미론의 소유자는 이 계층이므로, 반환 행이 현재의 `isPreviewableChat`과
     * 어긋나면(앱에 박힌 구버전 의미론) 그 채널만 윈도우 읽기로 다시 유도합니다. fast path가
     * `null`이면(미구현 IndexedDB, 구버전 앱, 일시 오류) 전 채널을 윈도우로 읽습니다 —
     * 오늘의 동작 그대로가 폴백입니다.
     *
     * `lastNo`는 프리뷰 가능 여부와 무관한 그 채널 캐시의 최대 chatNo입니다. head-트리거가
     * "최신 행들이 리액션이라 프리뷰가 head보다 낮은" 상태를 부족분으로 오판하지 않게 하는
     * 비교 기준이므로, 폴백에서도 같은 정의로 계산합니다.
     */
    public async cacheReadLastList(
        channelIds: string[],
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainLastChat[]> {
        const validIds = Array.from(new Set(channelIds.filter(Boolean)));
        if (validIds.length === 0) return [];

        const byChannel = new Map<string, DomainLastChat>();
        const fallbackIds: string[] = [];

        const fast = this.cacheStorage.loadLastPerChannel ? await this.cacheStorage.loadLastPerChannel(validIds) : null;
        if (fast) {
            const fastByChannel = this.indexLastItemsByChannel(fast);
            for (const channelId of validIds) {
                const row = fastByChannel.get(channelId);
                // 행 없는 채널의 `{ lastNo: 0, item: null }`은 유효한 답("프리뷰 없음")이라
                // 폴백하지 않습니다. 폴백은 응답에서 누락됐거나 재검증에 실패한 채널만.
                if (!row || (row.item && !isPreviewableChat(row.item))) fallbackIds.push(channelId);
                else byChannel.set(channelId, { channelId, lastNo: row.lastNo ?? 0, chat: row.item ?? null });
            }
        } else {
            fallbackIds.push(...validIds);
        }

        await Promise.all(
            fallbackIds.map(async channelId => {
                const page = await this.cacheReadList(
                    { channelId, limit: LAST_CHAT_FALLBACK_LOOKBACK },
                    contextOverride
                );
                const list = page?.list ?? [];
                const lastNo = list.reduce((max, chat) => Math.max(max, chat.chatNo ?? 0), 0);
                const row: DomainLastChat = { channelId, lastNo, chat: pickPreviewChat(list) ?? null };
                byChannel.set(channelId, row);
            })
        );

        // 요청 순서 보존 — 구독자가 안정된 순서를 받아 채널 id로만 색인하면 되게.
        return validIds.map(channelId => byChannel.get(channelId)).filter((row): row is DomainLastChat => !!row);
    }

    /**
     * `cacheReadLastList`의 옵저버 형태. 키는 채널 집합으로 결정되고(정렬해 순서 무관),
     * 어떤 chat 쓰기든 `chats-last|` 프리픽스(getAffectedListPrefixes)로 이 그룹을 깨웁니다 —
     * 집합 멤버십을 startsWith로 표현할 수 없어 스코프 전역 프리픽스를 쓰는데, 이 옵저버는
     * 홈 마운트 중에만 존재하고 재실행은 50ms 플러시로 합쳐지므로 감당 가능한 비용입니다.
     */
    public observeLastList(
        channelIds: string[],
        callback: LocalDataSourceV2Callback<DomainLastChat[]>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        const validIds = Array.from(new Set(channelIds.filter(Boolean)));
        const key = this.createListObserverKey(
            ['chats-last', `channels:${[...validIds].sort().join(',')}`],
            contextOverride
        );
        return this.observeListQuery(key, () => this.cacheReadLastList(validIds, contextOverride), callback);
    }

    public async cacheWrite(
        item: Partial<DomainChat>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const id = this.assertRequiredString(item.id, 'id');

        const context = this.getContext(contextOverride);
        if (!context.sid) {
            throw new Error('[ChatLocalDataSourceV2] sid is required in context to save chat.');
        }

        const existing = await this.cacheStorage.load(id);
        const cid = context.cid || 'default';
        const merged: DomainChat = {
            ...(existing ?? ({} as DomainChat)),
            ...item,
            id,
            cid,
            channelId: item.channelId ?? existing?.channelId ?? '',
            chatNo: item.chatNo ?? existing?.chatNo ?? 0,
            isPending: item.isPending ?? existing?.isPending ?? false,
            isFailed: item.isFailed ?? existing?.isFailed ?? false,
            createdAtMs: item.createdAtMs ?? existing?.createdAtMs ?? Date.now(),
            updatedAtMs: item.updatedAtMs ?? existing?.updatedAtMs ?? Date.now(),
        };

        await this.cacheStorage.save(id, merged);
        this.scheduleItemReemit([id], contextOverride);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.channelId, merged.channelId], contextOverride));
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainChat>>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;

        const context = this.getContext(contextOverride);
        if (!context.sid) {
            throw new Error('[ChatLocalDataSourceV2] sid is required in context to save chats.');
        }

        const cid = context.cid || 'default';
        const existingById = this.indexById(await this.cacheStorage.loadMany(validItems.map(item => item.id!)));

        const mergedList = validItems.map(item => {
            const existing = existingById.get(item.id!);
            return {
                ...(existing ?? ({} as DomainChat)),
                ...item,
                id: item.id!,
                cid,
                channelId: item.channelId ?? existing?.channelId ?? '',
                chatNo: item.chatNo ?? existing?.chatNo ?? 0,
                isPending: item.isPending ?? existing?.isPending ?? false,
                isFailed: item.isFailed ?? existing?.isFailed ?? false,
                createdAtMs: item.createdAtMs ?? existing?.createdAtMs ?? Date.now(),
                updatedAtMs: item.updatedAtMs ?? existing?.updatedAtMs ?? Date.now(),
            } as DomainChat;
        });

        await this.cacheStorage.saveAll(mergedList);
        this.scheduleItemReemit(validItems.map(item => item.id!).filter(Boolean), contextOverride);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                mergedList.map(item => item.channelId),
                contextOverride
            )
        );
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const requiredId = this.assertRequiredString(id, 'id');
        const existing = await this.cacheStorage.load(requiredId);
        await this.cacheStorage.delete(requiredId);
        this.scheduleItemReemit([requiredId], contextOverride);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.channelId], contextOverride));
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        // 어떤 채널의 리스트를 다시 읽어야 하는지만 알면 되므로, 없는 id가 빠져도 무관합니다
        // (`loadMany`는 결과 길이/순서를 보장하지 않습니다).
        const existingItems = await this.cacheStorage.loadMany(validIds);
        await this.cacheStorage.deleteAll(validIds);
        this.scheduleItemReemit(validIds, contextOverride);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                existingItems.map(item => item.channelId),
                contextOverride
            )
        );
    }

    public async cacheClear(_contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        this.scheduleFullReemit();
    }

    public async cacheClearByChannelId(
        channelId: string,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const requiredChannelId = this.assertRequiredString(channelId, 'channelId');
        await this.cacheStorage.clearByChannelId(requiredChannelId);
        this.scheduleListReemit(this.getAffectedListPrefixes([requiredChannelId], contextOverride));
    }

    /** fast-path 응답을 channelId로 색인합니다 — 응답은 요청 순서·길이를 보장하지 않습니다. */
    private indexLastItemsByChannel(items: LastChatItem[]): Map<string, LastChatItem> {
        const byChannel = new Map<string, LastChatItem>();
        for (const item of items) {
            if (item?.channelId) byChannel.set(item.channelId, item);
        }
        return byChannel;
    }

    private getListKey(query: ChatFeedInput, contextOverride?: LocalDataSourceV2ContextOverride): string {
        return this.createListObserverKey(
            // Every field that reaches storage must be in the key: observers on one key share a
            // single query execution, so a field left out would let two different reads collapse
            // into one wrong answer. `cacheReadList` spreads the whole query into `loadAll`, and
            // the executor branches on includeUnsent (sort/keyword go on to the native path).
            [
                'chats',
                `channel:${query.channelId || '__none__'}`,
                `cursor:${query.cursorNo ?? 'latest'}`,
                `limit:${query.limit ?? 50}`,
                `unsent:${(query as { includeUnsent?: boolean }).includeUnsent ? 1 : 0}`,
                `sort:${(query as { sort?: string }).sort ?? 'default'}`,
                `keyword:${(query as { keyword?: string }).keyword ?? ''}`,
            ],
            contextOverride
        );
    }

    private getAffectedListPrefixes(
        channelIds: Array<string | undefined>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): string[] {
        const scopeKey = this.getScopeKey(contextOverride);
        const uniqueChannels = Array.from(new Set(channelIds.map(channelId => channelId || '__none__')));
        // Written channels only. A bare `${scopeKey}|chats` prefix matches EVERY chat observer under
        // `key.startsWith(prefix)`, so one write re-read storage for every open channel's list
        // instead of the one that changed. No catch-all entry: `cacheReadList` requires channelId,
        // so a channel-less observer cannot exist. The per-channel prefix still spans that channel's
        // cursor/limit variants.
        // The trailing `|` pins the match to a whole key segment; without it `channel:ch-1` also
        // matches `channel:ch-10`.
        //
        // `chats-last|` is the one deliberate catch-all: the combined last-chat observer's key is a
        // channel SET, which startsWith cannot test membership against — so every chat write wakes
        // it. Scoped to home's single observer and coalesced by the 50ms flush, that is cheaper than
        // inventing a set-aware matcher. `|chats|` keys don't match it (different segment), so the
        // per-channel routing above is untouched.
        //
        return [
            ...uniqueChannels.map(channelId => `${scopeKey}|chats|channel:${channelId}|`),
            `${scopeKey}|chats-last|`,
        ];
    }
}
