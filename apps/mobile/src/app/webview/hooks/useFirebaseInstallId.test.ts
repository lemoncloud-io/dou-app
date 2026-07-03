import { renderHook, act } from '@testing-library/react';

import { useFirebaseInstallId } from './useFirebaseInstallId';

const mockGetFirebaseId = jest.fn();

jest.mock('../../services', () => ({
    firebaseInstallationService: {
        getFirebaseId: (...args: any[]) => mockGetFirebaseId(...args),
    },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Flush the getFirebaseId().then/.catch microtasks queued during the mount effect.
const flushMicrotasks = () =>
    act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });

describe('useFirebaseInstallId', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('마운트 시 Firebase 설치 ID를 받아와 반환한다', async () => {
        mockGetFirebaseId.mockResolvedValue('fid_abc123');

        const { result } = renderHook(() => useFirebaseInstallId());

        // Initial render happens before the async lookup resolves.
        expect(result.current).toBeNull();

        await flushMicrotasks();

        expect(result.current).toBe('fid_abc123');
    });

    it('설치 ID가 null이면 null을 유지한다', async () => {
        mockGetFirebaseId.mockResolvedValue(null);

        const { result } = renderHook(() => useFirebaseInstallId());
        await flushMicrotasks();

        expect(result.current).toBeNull();
    });

    it('조회가 실패해도 throw 없이 null을 유지한다', async () => {
        mockGetFirebaseId.mockRejectedValue(new Error('network'));

        const { result } = renderHook(() => useFirebaseInstallId());
        await flushMicrotasks();

        expect(result.current).toBeNull();
    });
});
