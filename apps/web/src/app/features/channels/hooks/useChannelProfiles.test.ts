import { renderHook, waitFor } from '@testing-library/react';

import { getSyncManager, useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainProfile } from '@chatic/data';

import { useChannelProfiles } from './useChannelProfiles';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
    getSyncManager: jest.fn(),
}));

const observeList = jest.fn();
const cacheReadList = jest.fn();
const register = jest.fn();

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
    register.mockReturnValue(() => undefined);
    seedObserve([]);
    cacheReadList.mockResolvedValue({ list: [] });
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ profile: { observeList, cacheReadList } });
    (getSyncManager as jest.Mock).mockReturnValue({ register });
});

describe('useChannelProfiles — 사이트 프로필 구독/동기화', () => {
    it('observe 결과를 userId 기준 profileMap으로 만든다', () => {
        seedObserve([profile('u1', { nick: 'Al' }), profile('u2', { nick: 'Bo' })]);

        const { result } = renderHook(() => useChannelProfiles('s1', ['u1', 'u2']));

        expect(observeList).toHaveBeenCalledWith({ sid: 's1' }, expect.any(Function));
        expect(result.current.profileMap.get('u1')?.nick).toBe('Al');
        expect(result.current.profileMap.get('u2')?.nick).toBe('Bo');
    });

    it('캐시에 프로필이 있는 멤버만 profile sync를 등록한다', async () => {
        cacheReadList.mockResolvedValue({ list: [profile('u1')] });

        renderHook(() => useChannelProfiles('s1', ['u1', 'u2']));

        await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
        expect(register).toHaveBeenCalledWith({ type: 'profile', id: 's1@u1', intervalMs: 5000 });
    });

    it('sid가 없으면 구독/등록하지 않는다', () => {
        renderHook(() => useChannelProfiles(null, ['u1']));
        expect(observeList).not.toHaveBeenCalled();
        expect(register).not.toHaveBeenCalled();
    });

    it('언마운트 시 등록한 sync를 해제한다', async () => {
        const dispose = jest.fn();
        register.mockReturnValue(dispose);
        cacheReadList.mockResolvedValue({ list: [profile('u1')] });

        const { unmount } = renderHook(() => useChannelProfiles('s1', ['u1']));
        await waitFor(() => expect(register).toHaveBeenCalledTimes(1));

        unmount();
        expect(dispose).toHaveBeenCalledTimes(1);
    });
});
