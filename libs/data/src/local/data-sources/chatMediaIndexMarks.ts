import type { CacheMetaView } from '@chatic/bridge-messages';

import { CHAT_MEDIA_ENTRIES_VERSION } from '../../domain/chatMediaEntries';
import type { DataContext } from '../../repositories/types';
import type { ScopedCacheStorage } from '../ports';

export interface ChatMediaIndexMarks {
    isIndexed(channelId: string, context: DataContext): Promise<boolean>;
    markIndexed(channelId: string, context: DataContext): Promise<void>;
}

export const chatMediaIndexMarkId = (channelId: string): string =>
    `chatmedia-indexed:v${CHAT_MEDIA_ENTRIES_VERSION}:${channelId}`;

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
