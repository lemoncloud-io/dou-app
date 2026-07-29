import { renderHook, waitFor } from '@testing-library/react';

import { getSyncManager, useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainProfile } from '@chatic/data';

import { useChannelProfiles } from './useChannelProfiles';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
    useRuntimeSocketState: jest.fn(),
    getSyncManager: jest.fn(),
}));

const observeList = jest.fn();
const cacheReadList = jest.fn();
const refreshItem = jest.fn();
const registerProfile = jest.fn();

const profile = (userId: string, fields: Partial<DomainProfile> = {}): DomainProfile =>
    ({ userId, ...fields }) as unknown as DomainProfile;

// Seed observeList to emit the given rows synchronously and return a disposer spy.
const seedObserve = (rows: DomainProfile[]) => {
    observeList.mockImplementation((_query, cb) => {
        cb({ list: rows });
        return () => undefined;
    });
};

beforeEach(() => {
    jest.clearAllMocks();
    registerProfile.mockReturnValue(() => undefined);
    seedObserve([]);
    cacheReadList.mockResolvedValue({ list: [] });
    refreshItem.mockResolvedValue(null);
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ profile: { observeList, cacheReadList, refreshItem } });
    (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: true });
    (getSyncManager as jest.Mock).mockReturnValue({ registerProfile });
});

describe('useChannelProfiles — 사이트 프로필 구독/동기화', () => {
    it('observe 결과를 userId 기준 profileMap으로 만든다', () => {
        seedObserve([profile('u1', { nick: 'Al' }), profile('u2', { nick: 'Bo' })]);

        const { result } = renderHook(() => useChannelProfiles('s1', ['u1', 'u2']));

        expect(observeList).toHaveBeenCalledWith({ sid: 's1' }, expect.any(Function));
        expect(result.current.profileMap.get('u1')?.nick).toBe('Al');
        expect(result.current.profileMap.get('u2')?.nick).toBe('Bo');
    });

    it('캐시 여부와 무관하게 모든 멤버에 profile sync를 등록한다', () => {
        cacheReadList.mockResolvedValue({ list: [profile('u1')] });

        renderHook(() => useChannelProfiles('s1', ['u1', 'u2']));

        expect(registerProfile).toHaveBeenCalledTimes(2);
        expect(registerProfile).toHaveBeenCalledWith('s1@u1', 5000);
        expect(registerProfile).toHaveBeenCalledWith('s1@u2', 5000);
    });

    it('캐시에 없는 멤버만 refreshItem으로 즉시 부트스트랩한다', async () => {
        cacheReadList.mockResolvedValue({ list: [profile('u1')] });

        renderHook(() => useChannelProfiles('s1', ['u1', 'u2']));

        await waitFor(() => expect(refreshItem).toHaveBeenCalledTimes(1));
        expect(refreshItem).toHaveBeenCalledWith('s1@u2');
    });

    it('refreshItem이 실패해도 등록은 유지된다', async () => {
        cacheReadList.mockResolvedValue({ list: [] });
        refreshItem.mockRejectedValue(new Error('network'));

        renderHook(() => useChannelProfiles('s1', ['u1']));

        await waitFor(() => expect(refreshItem).toHaveBeenCalledWith('s1@u1'));
        expect(registerProfile).toHaveBeenCalledWith('s1@u1', 5000);
    });

    it('sid가 없으면 구독/등록하지 않는다', () => {
        renderHook(() => useChannelProfiles(null, ['u1']));
        expect(observeList).not.toHaveBeenCalled();
        expect(registerProfile).not.toHaveBeenCalled();
    });

    it('isVerified가 false면 등록하지 않는다', () => {
        (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: false });

        renderHook(() => useChannelProfiles('s1', ['u1']));

        expect(registerProfile).not.toHaveBeenCalled();
    });

    it('언마운트 시 등록한 sync를 해제한다', () => {
        const dispose = jest.fn();
        registerProfile.mockReturnValue(dispose);

        const { unmount } = renderHook(() => useChannelProfiles('s1', ['u1']));
        expect(registerProfile).toHaveBeenCalledTimes(1);

        unmount();
        expect(dispose).toHaveBeenCalledTimes(1);
    });
});
