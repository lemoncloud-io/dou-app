import 'fake-indexeddb/auto';
import {
    CHAT_MEDIA_CONTRACT_CASES,
    type ChatMediaContractScope,
    type ChatMediaContractStore,
    runChatMediaContractCase,
} from '@chatic/bridge-messages/testing';
import { IndexedDBDatabase } from './IndexedDBDatabase';
import { IndexedDBAdapter } from './IndexedDBAdapter';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = ((value: unknown) => JSON.parse(JSON.stringify(value))) as typeof structuredClone;
}

/**
 * The room media index contract on IndexedDB. The same table runs against the shell's real SQLite in
 * `apps/mobile` (`chatMediaIndex.contract.test.ts` there); both must answer it identically.
 *
 * The database is shared across cases, so each case runs in clouds of its own (`<case>/<cid>`).
 */
const storeFor = (db: IndexedDBDatabase, namespace: string): ChatMediaContractStore => {
    const adapterFor = (scope: ChatMediaContractScope) =>
        new IndexedDBAdapter(db, 'chat', {
            getContext: () => ({ cid: `${namespace}/${scope.cid}`, uid: scope.uid }),
            setContext: () => undefined,
        });
    return {
        saveAll: async (scope, rows) => void (await adapterFor(scope).saveAll(rows)),
        deleteAll: (scope, ids) => adapterFor(scope).deleteAll(ids),
        clearByChannel: (scope, channelId) => adapterFor(scope).clearByChannelId(channelId),
        clearAll: scope => adapterFor(scope).clearAll(),
        list: async (scope, query) => (await adapterFor(scope).loadChatMedia(query))!,
        count: async (scope, channelId) => (await adapterFor(scope).countChatMedia(channelId))!,
        fill: (scope, items, version) => adapterFor(scope).saveChatMediaEntries(items, version),
    };
};

describe('room media index contract — IndexedDB', () => {
    const db = new IndexedDBDatabase();

    it.each(CHAT_MEDIA_CONTRACT_CASES.map((contractCase, index) => ({ ...contractCase, index })))(
        '$name',
        async contractCase => {
            const { expected, actual } = await runChatMediaContractCase(
                storeFor(db, `case-${contractCase.index}`),
                contractCase
            );
            expect(actual).toEqual(expected);
        }
    );
});
