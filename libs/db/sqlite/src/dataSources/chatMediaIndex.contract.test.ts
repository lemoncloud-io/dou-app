import {
    CHAT_MEDIA_CONTRACT_CASES,
    type ChatMediaContractStore,
    runChatMediaContractCase,
} from '@chatic/bridge-messages/testing';

import { createRealSqliteDatabase, migrate, openMemorySqlite } from '../testing/realSqliteDatabase';
import { TARGET_VERSION } from '../schema';
import { TABLES } from '../tables';
import { ChatDataSource } from './ChatDataSource';

const freshStore = (): { store: ChatMediaContractStore; close: () => void } => {
    const db = openMemorySqlite();
    migrate(db, 0, TARGET_VERSION);
    const chats = new ChatDataSource(createRealSqliteDatabase(db), TABLES.CHATS);
    return {
        store: {
            saveAll: (scope, rows) =>
                chats.saveAll(
                    rows.map(row => ({ id: row.id, data: row })),
                    scope.cid,
                    scope.uid
                ),
            deleteAll: (scope, ids) => chats.removeAll(ids, scope.cid, scope.uid),
            clearByChannel: (scope, channelId) => chats.clearByChannel(channelId, scope.cid, scope.uid),
            clearAll: scope => chats.clear(scope.cid, scope.uid),
            list: (scope, query) => chats.fetchMediaPage(query, scope.cid, scope.uid),
            count: (scope, channelId) => chats.countMedia(channelId, scope.cid, scope.uid),
            fill: (scope, items, version) => chats.saveMediaFill(items, version, scope.cid, scope.uid),
        },
        close: () => db.close(),
    };
};

describe('room media index contract — shell SQLite', () => {
    it.each(CHAT_MEDIA_CONTRACT_CASES)('$name', async contractCase => {
        const { store, close } = freshStore();
        try {
            const { expected, actual } = await runChatMediaContractCase(store, contractCase);
            expect(actual).toEqual(expected);
        } finally {
            close();
        }
    });
});
