import type { WebMessageData } from '@chatic/bridge-messages';

import type { ILogService } from '../log';
import { createCacheMessageHandlers } from './cacheMessages';
import type { ICacheCrudService, ICacheSearchService } from './types';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as ILogService;

const scope = { cid: 'c1', uid: 'u1' };

const setup = () => {
    const crud = {
        fetch: jest.fn(),
        fetchMany: jest.fn(),
        fetchAll: jest.fn(),
        fetchLastChats: jest.fn(),
        save: jest.fn(),
        saveAll: jest.fn(),
        delete: jest.fn(),
        deleteAll: jest.fn(),
        clear: jest.fn(),
        clearByChannel: jest.fn(),
    } as unknown as jest.Mocked<ICacheCrudService>;
    const search = { search: jest.fn() } as unknown as jest.Mocked<ICacheSearchService>;
    const handlers = createCacheMessageHandlers({ crud: () => crud, search: () => search, logger });
    return { crud, search, handlers };
};

const message = <K extends 'FetchAllCacheData'>(type: K, data: unknown) => ({ type, data }) as WebMessageData<K>;

/**
 * Each message's answer when its service resolves and when it throws — the answers the WebView's
 * handlers gave before they were moved here, so a page sees no change.
 */
const CASES = [
    {
        type: 'FetchAllCacheData',
        method: 'fetchAll',
        data: { type: 'chat', ...scope, query: { channelId: 'ch' } },
        value: [{ id: 'a' }],
        ok: {
            type: 'OnFetchAllCacheData',
            data: { type: 'chat', ...scope, items: [{ id: 'a' }], query: { channelId: 'ch' } },
        },
        failed: { type: 'OnFetchAllCacheData', data: { type: 'chat', ...scope, items: null } },
    },
    {
        type: 'FetchCacheData',
        method: 'fetch',
        data: { type: 'user', ...scope, id: 'x' },
        value: { id: 'x' },
        ok: { type: 'OnFetchCacheData', data: { type: 'user', ...scope, id: 'x', item: { id: 'x' } } },
        failed: { type: 'OnFetchCacheData', data: { type: 'user', ...scope, id: 'x', item: null } },
    },
    {
        type: 'FetchLastChatsData',
        method: 'fetchLastChats',
        data: { type: 'chat', ...scope, channelIds: ['ch'] },
        value: [{ channelId: 'ch' }],
        ok: {
            type: 'OnFetchLastChatsData',
            data: { type: 'chat', ...scope, channelIds: ['ch'], items: [{ channelId: 'ch' }] },
        },
        failed: { type: 'OnFetchLastChatsData', data: { type: 'chat', ...scope, channelIds: ['ch'], items: null } },
    },
    {
        type: 'FetchManyCacheData',
        method: 'fetchMany',
        data: { type: 'user', ...scope, ids: ['x'] },
        value: [{ id: 'x' }],
        ok: { type: 'OnFetchManyCacheData', data: { type: 'user', ...scope, ids: ['x'], items: [{ id: 'x' }] } },
        failed: { type: 'OnFetchManyCacheData', data: { type: 'user', ...scope, ids: ['x'], items: null } },
    },
    {
        type: 'SaveCacheData',
        method: 'save',
        data: { type: 'user', ...scope, id: 'x', item: { id: 'x' } },
        value: 'x',
        ok: { type: 'OnSaveCacheData', data: { type: 'user', ...scope, id: 'x', success: true } },
        failed: { type: 'OnSaveCacheData', data: { type: 'user', ...scope, id: null, success: false } },
    },
    {
        type: 'SaveAllCacheData',
        method: 'saveAll',
        data: { type: 'user', ...scope, items: [{ id: 'x' }], query: { limit: 1 } },
        value: ['x'],
        ok: {
            type: 'OnSaveAllCacheData',
            data: { type: 'user', ...scope, ids: ['x'], success: true, query: { limit: 1 } },
        },
        failed: { type: 'OnSaveAllCacheData', data: { type: 'user', ...scope, ids: [], success: false } },
    },
    {
        type: 'DeleteCacheData',
        method: 'delete',
        data: { type: 'user', ...scope, id: 'x' },
        value: 'x',
        ok: { type: 'OnDeleteCacheData', data: { type: 'user', ...scope, id: 'x', success: true } },
        failed: { type: 'OnDeleteCacheData', data: { type: 'user', ...scope, id: null, success: false } },
    },
    {
        type: 'DeleteAllCacheData',
        method: 'deleteAll',
        data: { type: 'user', ...scope, ids: ['x'] },
        value: ['x'],
        ok: { type: 'OnDeleteAllCacheData', data: { type: 'user', ...scope, ids: ['x'], success: true } },
        failed: { type: 'OnDeleteAllCacheData', data: { type: 'user', ...scope, ids: [], success: false } },
    },
    {
        type: 'ClearCacheData',
        method: 'clear',
        data: { type: 'user', ...scope },
        value: undefined,
        ok: { type: 'OnClearCacheData', data: { type: 'user', ...scope, success: true } },
        failed: { type: 'OnClearCacheData', data: { type: 'user', ...scope, success: false } },
    },
    {
        type: 'ClearCacheDataByChannel',
        method: 'clearByChannel',
        data: { type: 'chat', ...scope, channelId: 'ch' },
        value: undefined,
        ok: { type: 'OnClearCacheDataByChannel', data: { type: 'chat', ...scope, channelId: 'ch', success: true } },
        failed: {
            type: 'OnClearCacheDataByChannel',
            data: { type: 'chat', ...scope, channelId: 'ch', success: false },
        },
    },
] as const;

describe('createCacheMessageHandlers', () => {
    it.each(CASES)('answers $type with what the service gave', async ({ type, method, data, value, ok }) => {
        const { crud, handlers } = setup();
        (crud[method] as jest.Mock).mockResolvedValue(value);

        const handle = handlers[type] as (m: unknown) => Promise<unknown>;
        await expect(handle(message(type as 'FetchAllCacheData', data))).resolves.toEqual({ ...ok, success: true });
        expect(crud[method]).toHaveBeenCalledWith(data);
    });

    it.each(CASES)(
        'answers a failed $type with an empty result, not an error',
        async ({ type, method, data, failed }) => {
            const { crud, handlers } = setup();
            (crud[method] as jest.Mock).mockRejectedValue(new Error('sqlite'));

            const handle = handlers[type] as (m: unknown) => Promise<unknown>;
            await expect(handle(message(type as 'FetchAllCacheData', data))).resolves.toEqual({
                ...failed,
                success: true,
            });
        }
    );

    it('answers a search with its items, and a failed search with SEARCH_ERROR', async () => {
        const { search, handlers } = setup();
        search.search.mockResolvedValueOnce([{ id: 'x', _domain: 'chat' }] as never);
        const request = {
            type: 'SearchGlobalCacheData',
            data: { keyword: 'hi', ...scope },
        } as WebMessageData<'SearchGlobalCacheData'>;

        await expect(handlers.SearchGlobalCacheData(request)).resolves.toEqual({
            type: 'OnSearchGlobalCacheData',
            success: true,
            data: { items: [{ id: 'x', _domain: 'chat' }] },
        });
        expect(search.search).toHaveBeenCalledWith('hi', 'c1', 'u1');

        search.search.mockRejectedValueOnce(new Error('no fts'));
        await expect(handlers.SearchGlobalCacheData(request)).resolves.toEqual({
            type: 'OnSearchGlobalCacheData',
            success: false,
            error: { code: 'SEARCH_ERROR', message: 'no fts' },
        });
    });

    it('reaches the services only when a message arrives', () => {
        const crud = jest.fn();
        const search = jest.fn();
        createCacheMessageHandlers({ crud, search, logger });
        expect(crud).not.toHaveBeenCalled();
        expect(search).not.toHaveBeenCalled();
    });
});
