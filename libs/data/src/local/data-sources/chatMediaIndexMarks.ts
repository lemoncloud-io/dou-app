import type { CacheMetaView } from '@chatic/bridge-messages';

import { CHAT_MEDIA_ENTRIES_VERSION } from '../../domain/chatMediaEntries';
import type { DataContext } from '../../repositories/types';
import type { ScopedCacheStorage } from '../ports';

/**
 * Which rooms have had the messages they already held indexed, one `meta` cache row per room.
 *
 * A message written after the index existed is indexed on its write; one cached before it is not,
 * so a room is filled once — the first time its media is read — and this mark says it was.
 */
export interface ChatMediaIndexMarks {
    isIndexed(channelId: string, context: DataContext): Promise<boolean>;
    markIndexed(channelId: string, context: DataContext): Promise<void>;
}

/**
 * The mark's row id. The rules' version is part of it, so raising `CHAT_MEDIA_ENTRIES_VERSION` reads
 * every room as unmarked and each is filled again under the new rules.
 */
export const chatMediaIndexMarkId = (channelId: string): string =>
    `chatmedia-indexed:v${CHAT_MEDIA_ENTRIES_VERSION}:${channelId}`;

/**
 * Marks kept in the same `meta` cache as the sync cursors, so clearing the device's cache takes them
 * with it — a mark that outlived the rows it describes would leave a room never filled again.
 *
 * Read with their own rule rather than through `SyncMetaLocalDataSource.getSyncedAt`, which retires a
 * cursor past the `meta` TTL (30 minutes): read that way, every room would be filled again every half
 * hour. A mark has no age. It is trusted while it was written under the storage routing in force now
 * (`routingFingerprint` — the chat rows may since have moved to another store, which starts empty of
 * index entries) and after the last cache clear (`cursorsValidAfter`). The stores never delete a row
 * for its TTL — expiry is computed only where a reader asks for it — so ignoring it here is enough.
 */
export const createChatMediaIndexMarks = (
    storages: ScopedCacheStorage<'meta'>,
    routingFingerprint?: string,
    cursorsValidAfter?: () => number
): ChatMediaIndexMarks => ({
    async isIndexed(channelId, context) {
        const row = await storages.forScope(context).load(chatMediaIndexMarkId(channelId));
        if (!row) return false;
        if (routingFingerprint && row.routing !== routingFingerprint) return false;
        const savedAt = row.__cacheMeta?.lastSyncedAt ?? row.syncedAt ?? 0;
        return !cursorsValidAfter || savedAt >= cursorsValidAfter();
    },
    async markIndexed(channelId, context) {
        const id = chatMediaIndexMarkId(channelId);
        const view: CacheMetaView = {
            id,
            cid: context.cid || 'default',
            uid: context.uid || 'default',
            syncedAt: Date.now(),
            ...(routingFingerprint ? { routing: routingFingerprint } : {}),
        };
        await storages.forScope(context).save(id, view);
    },
});

/**
 * Marks that live as long as the data source — for a data source assembled without a `meta` slot
 * (suites, a hand-built graph). A room is then filled once per session instead of once per device.
 */
export const createMemoryChatMediaIndexMarks = (): ChatMediaIndexMarks => {
    const indexed = new Set<string>();
    const keyOf = (channelId: string, context: DataContext) => `${context.cid ?? ''}|${context.uid ?? ''}|${channelId}`;
    return {
        isIndexed: async (channelId, context) => indexed.has(keyOf(channelId, context)),
        markIndexed: async (channelId, context) => {
            indexed.add(keyOf(channelId, context));
        },
    };
};
