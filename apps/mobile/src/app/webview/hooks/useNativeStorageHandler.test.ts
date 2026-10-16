import { renderHook } from '@testing-library/react';

import { useNativeStorageHandler } from './useNativeStorageHandler';

const mockSummarize = jest.fn();
const mockClearCache = jest.fn();

jest.mock('../../services', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
    provider: {
        nativeStorageService: {
            summarize: () => mockSummarize(),
            clearCache: (options: unknown) => mockClearCache(options),
        },
    },
}));

const clearMessage = (data: unknown) => ({ type: 'ClearNativeCache', data }) as never;

describe('useNativeStorageHandler', () => {
    beforeEach(() => jest.clearAllMocks());

    it('answers the summary request with what the service reports', async () => {
        const summary = { sqlite: [], mmkv: [], unrecoverableTables: ['invite_clouds'] };
        mockSummarize.mockResolvedValue(summary);
        const { result } = renderHook(() => useNativeStorageHandler());

        const res = await result.current.handleFetchNativeStorageSummary({
            type: 'FetchNativeStorageSummary',
            data: {},
        } as never);

        expect(res).toEqual({ type: 'OnFetchNativeStorageSummary', success: true, data: summary });
    });

    it('turns a summary failure into an error response', async () => {
        mockSummarize.mockRejectedValue(new Error('boom'));
        const { result } = renderHook(() => useNativeStorageHandler());

        const res = await result.current.handleFetchNativeStorageSummary({
            type: 'FetchNativeStorageSummary',
            data: {},
        } as never);

        expect(res).toMatchObject({ success: false, error: { code: 'NATIVE_STORAGE_ERROR', message: 'boom' } });
    });

    it('drops the invited clouds only for an explicit true', async () => {
        mockClearCache.mockResolvedValue({ cleared: [], kept: [], failed: [] });
        const { result } = renderHook(() => useNativeStorageHandler());

        await result.current.handleClearNativeCache(clearMessage({ includeInvitedClouds: true }));
        await result.current.handleClearNativeCache(clearMessage({ includeInvitedClouds: 'yes' }));
        await result.current.handleClearNativeCache(clearMessage(undefined));

        expect(mockClearCache.mock.calls).toEqual([
            [{ includeInvitedClouds: true }],
            [{ includeInvitedClouds: false }],
            [{ includeInvitedClouds: false }],
        ]);
    });

    it('returns the clear result as the response data', async () => {
        const outcome = { cleared: ['chats'], kept: ['invite_clouds'], failed: [] };
        mockClearCache.mockResolvedValue(outcome);
        const { result } = renderHook(() => useNativeStorageHandler());

        const res = await result.current.handleClearNativeCache(clearMessage({ includeInvitedClouds: false }));

        expect(res).toEqual({ type: 'OnClearNativeCache', success: true, data: outcome });
    });
});
