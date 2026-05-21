import type { IIndexedDB, IndexedDbQueryExecutor, IndexedDbRow } from './types';
import type { ChatQueryOptions } from '@chatic/app-messages';
import { CHAT_PAGINATION_INDEX } from './IndexedDBDatabase';

/**
 * 채팅 도메인('chat') 전용 쿼리 실행기 구현체입니다.
 * 인덱스 필터링 및 커서 기반 역순 페이징 조회를 지원합니다.
 */
export class ChatQueryExecutor implements IndexedDbQueryExecutor<'chat'> {
    async execute(
        db: IIndexedDB,
        scope: { type: 'chat'; cid: string; uid: string },
        options?: ChatQueryOptions
    ): Promise<IndexedDbRow<'chat'>[]> {
        if (!options || !options.channelId) {
            // 채널 ID가 없는 경우 조회할 수 없으므로 빈 배열을 반환합니다.
            return [];
        }

        const limit = options.limit || 20;
        const upperBound = options.cursorNo ?? Infinity;
        const isExclusive = options.cursorNo !== undefined;

        // type, cid, uid, channel_id, chat_no
        const range = IDBKeyRange.bound(
            [scope.type, scope.cid, scope.uid, options.channelId, 0],
            [scope.type, scope.cid, scope.uid, options.channelId, upperBound],
            false,
            isExclusive
        );

        return db.loadWithCursor<'chat'>({
            indexName: CHAT_PAGINATION_INDEX,
            range,
            direction: 'prev',
            limit,
            filter: () => true,
        });
    }
}
