import type { IIndexedDB, IndexedDbQueryExecutor, IndexedDbRow } from '@chatic/data';
import type { ChatQueryOptions } from '@chatic/bridge-messages';
import { CHAT_PAGINATION_INDEX, TYPE_CID_UID_INDEX, UNSENT_CHAT_NO } from './IndexedDBDatabase';

export class ChatQueryExecutor implements IndexedDbQueryExecutor<'chat'> {
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
            return db.loadAll<'chat'>(TYPE_CID_UID_INDEX, [scope.type, scope.cid, scope.uid]);
        }

        const limit = options.limit || 20;
        const upperBound = options.cursorNo ?? Infinity;
        const isExclusive = options.cursorNo !== undefined;

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

        if (!options.includeUnsent || isExclusive) return readPage();

        const [page, unsent] = await Promise.all([readPage(), this.loadUnsent(db, prefix, limit)]);

        const seen = new Set(page.map(row => row.key));
        return [...page, ...unsent.filter(row => !seen.has(row.key))];
    }
}
