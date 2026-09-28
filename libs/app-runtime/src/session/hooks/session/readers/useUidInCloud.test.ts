import { act, renderHook } from '@testing-library/react';

import { backgroundClouds, resetBackgroundClouds } from '../../../../socket/backgroundClouds';
import { useUidInCloud } from './useUidInCloud';

const mockUids: Record<string, string | null> = {};
const mockSessionListeners = new Set<() => void>();
jest.mock('../../../store', () => ({
    getUidInCloud: (cid: string) => mockUids[cid] ?? null,
    subscribeSessionSignal: (listener: () => void) => {
        mockSessionListeners.add(listener);
        return () => mockSessionListeners.delete(listener);
    },
}));
jest.mock('../../../store/stores', () => ({ cloudStore: { peekCachedCloudTokens: () => null } }));

beforeEach(() => {
    resetBackgroundClouds();
    mockSessionListeners.clear();
    for (const key of Object.keys(mockUids)) delete mockUids[key];
});

describe('useUidInCloud', () => {
    it('answers with the uid the account has in that cloud', () => {
        mockUids['cloud-a'] = 'uid-a';

        const { result } = renderHook(() => useUidInCloud('cloud-a'));

        expect(result.current).toBe('uid-a');
    });

    it('follows a session change', () => {
        const { result } = renderHook(() => useUidInCloud('cloud-a'));

        act(() => {
            mockUids['cloud-a'] = 'uid-a';
            mockSessionListeners.forEach(listener => listener());
        });

        expect(result.current).toBe('uid-a');
    });

    it("follows a cloud's first tokens landing, which is no session signal", () => {
        const { result } = renderHook(() => useUidInCloud('cloud-b'));
        expect(result.current).toBeNull();

        act(() => {
            mockUids['cloud-b'] = 'uid-b';
            backgroundClouds.invalidate();
        });

        expect(result.current).toBe('uid-b');
    });
});
