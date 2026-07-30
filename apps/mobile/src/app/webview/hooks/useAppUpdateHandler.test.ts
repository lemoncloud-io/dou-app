import { renderHook } from '@testing-library/react';

import { useAppUpdateHandler } from './useAppUpdateHandler';

const mockCheckForUpdate = jest.fn();
const mockOpenStore = jest.fn();
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

jest.mock('../../hooks', () => ({
    useServices: () => ({
        versionService: { checkForUpdate: (...args: unknown[]) => mockCheckForUpdate(...args), openStore: (...args: unknown[]) => mockOpenStore(...args) },
        logService: mockLogger,
    }),
}));

describe('useAppUpdateHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('handleCheckAppUpdate는 versionService 결과를 OnCheckAppUpdate로 반환한다', async () => {
        const checkResult = {
            platform: 'ios' as const,
            currentVersion: '1.0.0',
            latestVersion: '1.1.0',
            updateAvailable: true,
            storeUrl: 'https://apps.apple.com/app/id6758658673',
        };
        mockCheckForUpdate.mockResolvedValue(checkResult);
        const { result } = renderHook(() => useAppUpdateHandler());

        const response = await result.current.handleCheckAppUpdate({ data: {} } as any);

        expect(response).toEqual({ type: 'OnCheckAppUpdate', success: true, data: checkResult });
    });

    it('handleCheckAppUpdate는 versionService가 실패하면 에러 응답을 반환한다', async () => {
        mockCheckForUpdate.mockRejectedValue(new Error('boom'));
        const { result } = renderHook(() => useAppUpdateHandler());

        const response = await result.current.handleCheckAppUpdate({ data: {} } as any);

        expect(response).toEqual({
            type: 'OnCheckAppUpdate',
            success: false,
            error: { code: 'CHECK_APP_UPDATE_ERROR', message: 'boom' },
        });
        expect(mockLogger.error).toHaveBeenCalled();
    });

    it('handleOpenStore는 versionService.openStore 성공 시 success: true를 반환한다', async () => {
        mockOpenStore.mockResolvedValue(undefined);
        const { result } = renderHook(() => useAppUpdateHandler());

        const response = await result.current.handleOpenStore({ data: {} } as any);

        expect(mockOpenStore).toHaveBeenCalled();
        expect(response).toEqual({ type: 'OnOpenStore', success: true });
    });

    it('handleOpenStore는 versionService가 실패하면 에러 응답을 반환한다', async () => {
        mockOpenStore.mockRejectedValue(new Error('no store'));
        const { result } = renderHook(() => useAppUpdateHandler());

        const response = await result.current.handleOpenStore({ data: {} } as any);

        expect(response).toEqual({
            type: 'OnOpenStore',
            success: false,
            error: { code: 'OPEN_STORE_ERROR', message: 'no store' },
        });
    });
});
