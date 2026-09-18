import type { IIndexedDB, IndexedDbQueryExecutor, IndexedDbRow } from '@chatic/data';
import type { ChatQueryOptions } from '@chatic/app-messages';
import { CHAT_PAGINATION_INDEX, TYPE_CID_UID_INDEX, UNSENT_CHAT_NO } from './IndexedDBDatabase';

/**
 * The query executor implementation dedicated to the chat domain ('chat').
 * Supports index filtering and cursor-based reverse-order paginated queries.
 */
export class ChatQueryExecutor implements IndexedDbQueryExecutor<'chat'> {
    /**
     * Reads a second range containing only unsent rows (`[0, 1)`, upper bound exclusive).
     *
     * Why it's needed: `chat_no: 0` sorts **lowest** in `CHAT_PAGINATION_INDEX`, but a page read
     * is `direction: 'prev'` + limit (the newest N). So in a channel with `limit` or more
     * committed messages, an unsent row gets pushed out of the page and is **never rendered** —
     * a failed message gets no "send failed" indicator and no retry button.
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
            // Allows a full query when there's no channel ID.
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

        // If not opted in, read only once — the default path behaves the same as before this
        // option existed. Same for a cursorNo page: that range already reaches down to 0, so
        // reading further would give back the same rows twice.
        if (!options.includeUnsent || isExclusive) return readPage();

        // Send both reads **concurrently**. Whether "an unsent row got cut off" can't be known
        // before the page comes back, and firing the second read sequentially after that would
        // add its round trip straight onto the list's latency. What's more, the condition
        // available for that check ("the page has no unsent rows") can't tell *cut off* apart
        // from *never had any* — so the second read goes out anyway even for an ordinary busy
        // channel with no unsent rows, which is most reads. Firing them concurrently hides that
        // latency behind the first read. An empty `[0,1)` range makes the cursor finish
        // immediately.
        const [page, unsent] = await Promise.all([readPage(), this.loadUnsent(db, prefix, limit)]);

        // A short page already scanned the range to its end and may already contain the unsent
        // rows, so dedupe by key.
        const seen = new Set(page.map(row => row.key));
        return [...page, ...unsent.filter(row => !seen.has(row.key))];
    }
}
