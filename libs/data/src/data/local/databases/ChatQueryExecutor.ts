import type { IIndexedDB, IndexedDbQueryExecutor, IndexedDbRow } from './types';
import type { ChatQueryOptions } from '@chatic/app-messages';
import { CHAT_PAGINATION_INDEX, TYPE_CID_UID_INDEX, UNSENT_CHAT_NO } from './IndexedDBDatabase';

/**
 * 채팅 도메인('chat') 전용 쿼리 실행기 구현체입니다.
 * 인덱스 필터링 및 커서 기반 역순 페이징 조회를 지원합니다.
 */
export class ChatQueryExecutor implements IndexedDbQueryExecutor<'chat'> {
    /**
     * 미전송 행만 담긴 레인지(`[0, 1)`, 상한 exclusive)를 한 번 더 읽습니다.
     *
     * 필요한 이유: `chat_no: 0`은 `CHAT_PAGINATION_INDEX`에서 **최하위**로 정렬되는데 페이지 읽기는
     * `direction: 'prev'` + limit(최신 N개)입니다. 그래서 커밋된 메시지가 limit개 이상 쌓인 채널에서는
     * 미전송 행이 페이지 밖으로 밀려나 **한 번도 렌더되지 않습니다** — 실패한 메시지에 "전송 실패"
     * 표시도, 재전송 버튼도 붙지 않습니다.
     */
    private async loadUnsent(
        db: IIndexedDB,
        prefix: Array<string | number>,
        limit: number
    ): Promise<IndexedDbRow<'chat'>[]> {
        return db.loadWithCursor<'chat'>({
            indexName: CHAT_PAGINATION_INDEX,
            range: IDBKeyRange.bound([...prefix, UNSENT_CHAT_NO], [...prefix, UNSENT_CHAT_NO + 1], false, true),
            direction: 'prev',
            limit,
            filter: () => true,
        });
    }

    async execute(
        db: IIndexedDB,
        scope: { type: 'chat'; cid: string; uid: string },
        options?: ChatQueryOptions
    ): Promise<IndexedDbRow<'chat'>[]> {
        if (!options || !options.channelId) {
            // 채널 ID가 없는 경우 전체 조회를 허용합니다.
            return db.loadAll<'chat'>(TYPE_CID_UID_INDEX, [scope.type, scope.cid, scope.uid]);
        }

        const limit = options.limit || 20;
        const upperBound = options.cursorNo ?? Infinity;
        const isExclusive = options.cursorNo !== undefined;

        // type, cid, uid, channel_id, chat_no
        const prefix = [scope.type, scope.cid, scope.uid, options.channelId];
        const range = IDBKeyRange.bound([...prefix, UNSENT_CHAT_NO], [...prefix, upperBound], false, isExclusive);

        const page = await db.loadWithCursor<'chat'>({
            indexName: CHAT_PAGINATION_INDEX,
            range,
            direction: 'prev',
            limit,
            filter: () => true,
        });

        // 옵트인하지 않았으면 여기서 끝 — 기본 경로는 이 옵션이 없던 때와 동작이 같습니다.
        // cursorNo 페이지는 범위가 이미 0까지 내려가므로 더 읽으면 같은 행을 두 번 주게 됩니다.
        if (!options.includeUnsent || isExclusive) return page;

        // limit에 안 찼다면 커서가 범위를 끝까지 훑은 것이므로 미전송 행도 이미 들어 있습니다.
        // 페이지 안에 미전송 행이 하나라도 있어도 마찬가지입니다 — 최하위 정렬이라 전부 들어온 상태입니다.
        const dropped = page.length >= limit && !page.some(row => (row.chat_no ?? UNSENT_CHAT_NO) === UNSENT_CHAT_NO);
        if (!dropped) return page;

        // 위 조건상 page에는 미전송 행이 없으므로 두 결과는 서로소입니다(중복 제거 불필요).
        return [...page, ...(await this.loadUnsent(db, prefix, limit))];
    }
}
