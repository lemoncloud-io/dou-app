import type { IIndexedDB, IndexedDbQueryExecutor, IndexedDbRow } from '@chatic/data';
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

        const readPage = () =>
            db.loadWithCursor<'chat'>({
                indexName: CHAT_PAGINATION_INDEX,
                range,
                direction: 'prev',
                limit,
                filter: () => true,
            });

        // 옵트인하지 않았으면 한 번만 읽습니다 — 기본 경로는 이 옵션이 없던 때와 동작이 같습니다.
        // cursorNo 페이지도 마찬가지: 그 범위는 이미 0까지 내려가므로 더 읽으면 같은 행을 두 번 줍니다.
        if (!options.includeUnsent || isExclusive) return readPage();

        // 두 읽기를 **동시에** 보냅니다. "미전송 행이 잘렸는가"는 페이지를 받아 보기 전엔 알 수 없고,
        // 받아 본 뒤 순차로 두 번째를 쏘면 그 왕복이 목록 지연에 그대로 더해집니다. 게다가 판정에 쓸
        // 조건("페이지에 미전송 행이 없다")은 *잘린 경우*와 *애초에 없는 경우*를 구분하지 못해서,
        // 미전송 행이 없는 평범한 바쁜 채널 — 즉 대부분의 읽기 — 에서도 어차피 두 번째 읽기가 나갑니다.
        // 동시에 쏘면 그 지연이 첫 읽기 뒤에 숨습니다. 빈 `[0,1)` 레인지는 커서가 즉시 끝납니다.
        const [page, unsent] = await Promise.all([readPage(), this.loadUnsent(db, prefix, limit)]);

        // 짧은 페이지는 범위를 끝까지 훑어 미전송 행을 이미 담고 있으므로 키로 중복을 제거합니다.
        const seen = new Set(page.map(row => row.key));
        return [...page, ...unsent.filter(row => !seen.has(row.key))];
    }
}
