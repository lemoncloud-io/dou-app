import { NativeDBAdapter, NativeGlobalSearchSource } from '@chatic/db';
import type { DataContextProvider } from '@chatic/data';

import type { ILogService } from '../log';
import { createCacheMessageHandlers } from './cacheMessages';
import { createInProcessCacheClient } from './inProcessCacheClient';
import type { ICacheCrudService, ICacheSearchService } from './types';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as ILogService;

const context = { getContext: () => ({ cid: 'c1', uid: 'u1' }) } as unknown as DataContextProvider;

const setup = () => {
    const crud = {
        fetch: jest.fn(async () => null),
        fetchMany: jest.fn(async () => []),
        fetchAll: jest.fn(async () => []),
        fetchLastChats: jest.fn(async () => []),
        save: jest.fn(async ({ id }: { id: string }) => id),
        saveAll: jest.fn(async () => []),
        delete: jest.fn(async ({ id }: { id: string }) => id),
        deleteAll: jest.fn(async () => []),
        clear: jest.fn(async () => undefined),
        clearByChannel: jest.fn(async () => undefined),
    } as unknown as jest.Mocked<ICacheCrudService>;
    const search = { search: jest.fn(async () => []) } as unknown as jest.Mocked<ICacheSearchService>;
    const client = createInProcessCacheClient(
        createCacheMessageHandlers({ crud: () => crud, search: () => search, logger })
    );
    return { crud, search, client };
};

describe('createInProcessCacheClient', () => {
    it("carries a cache adapter's writes and reads to the service, scoped as the page's are", async () => {
        const { crud, client } = setup();
        crud.fetch.mockResolvedValueOnce({ id: 'u9', name: 'n' } as never);
        const users = new NativeDBAdapter(client, 'user', context);

        await users.save('u9', { id: 'u9', name: 'n' } as never);
        await expect(users.load('u9')).resolves.toEqual({ id: 'u9', name: 'n' });

        expect(crud.save).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'user', cid: 'c1', uid: 'u1', id: 'u9' })
        );
        expect(crud.fetch).toHaveBeenCalledWith({ type: 'user', cid: 'c1', uid: 'u1', id: 'u9' });
    });

    it('lets two identical reads in flight share one service call', async () => {
        const { crud, client } = setup();
        let release: (items: unknown[]) => void = () => undefined;
        crud.fetchAll.mockImplementationOnce(() => new Promise(resolve => (release = resolve as never)) as never);
        const channels = new NativeDBAdapter(client, 'channel', context);

        const first = channels.loadAll();
        const second = channels.loadAll();
        release([{ id: 'ch' }]);

        await expect(Promise.all([first, second])).resolves.toEqual([[{ id: 'ch' }], [{ id: 'ch' }]]);
        expect(crud.fetchAll).toHaveBeenCalledTimes(1);
    });

    it('rejects a failed search, as the WebView client does', async () => {
        const { search, client } = setup();
        search.search.mockRejectedValueOnce(new Error('no fts'));

        await expect(
            new NativeGlobalSearchSource(client).search('hi', { cid: 'c1', uid: 'u1' } as never)
        ).rejects.toEqual({
            code: 'SEARCH_ERROR',
            message: 'no fts',
        });
    });

    it('rejects a message the cache does not answer with NOT_FOUND, shaped as the bridge host answers', async () => {
        const { client } = setup();
        await expect(client.request({ type: 'Ping' } as never)).rejects.toEqual({
            code: 'NOT_FOUND',
            message: 'No handler registered for message type: Ping',
            reason: 'No handler is registered for the incoming WebMessage type.',
            recoverable: true,
        });
    });

    it('rejects an answer that never comes with TIMEOUT, and lets the next identical read go out', async () => {
        jest.useFakeTimers();
        try {
            const { crud } = setup();
            const handlers = createCacheMessageHandlers({ crud: () => crud, search: () => ({}) as never, logger });
            const client = createInProcessCacheClient(handlers, { timeoutMs: 50 });
            crud.fetchAll.mockImplementationOnce(() => new Promise(() => undefined) as never);
            const channels = new NativeDBAdapter(client, 'channel', context);

            const stuck = channels.loadAll();
            jest.advanceTimersByTime(50);
            await expect(stuck).rejects.toMatchObject({ code: 'TIMEOUT', requestType: 'FetchAllCacheData' });

            crud.fetchAll.mockResolvedValueOnce([{ id: 'ch' }] as never);
            await expect(channels.loadAll()).resolves.toEqual([{ id: 'ch' }]);
            expect(crud.fetchAll).toHaveBeenCalledTimes(2);
        } finally {
            jest.useRealTimers();
        }
    });
});
