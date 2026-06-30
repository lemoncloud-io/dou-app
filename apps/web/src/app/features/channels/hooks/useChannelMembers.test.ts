import { renderHook, waitFor } from '@testing-library/react';

import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import type { DomainJoin } from '@chatic/data';

import { useChannelMembers } from './useChannelMembers';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
    useSocketState: jest.fn(),
}));

const userObserveList = jest.fn();
const joinObserveList = jest.fn();
const syncChannelUsers = jest.fn();

const join = (userId: string, joined: number, fields: Partial<DomainJoin> = {}): DomainJoin =>
    ({ userId, joined, ...fields }) as unknown as DomainJoin;

// Seed the user/join observe streams to emit synchronously and return disposer spies.
const seedUsers = (rows: Array<{ id: string }>) =>
    userObserveList.mockImplementation((_q, cb) => {
        cb({ list: rows });
        return () => undefined;
    });
const seedJoins = (rows: DomainJoin[]) =>
    joinObserveList.mockImplementation((_q, cb) => {
        cb({ list: rows });
        return () => undefined;
    });

beforeEach(() => {
    jest.clearAllMocks();
    seedUsers([]);
    seedJoins([]);
    syncChannelUsers.mockResolvedValue(42);
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        user: { observeList: userObserveList, syncChannelUsers },
        join: { observeList: joinObserveList },
    });
    (useSocketState as jest.Mock).mockReturnValue({ isVerified: true });
});

describe('useChannelMembers — 멤버 적재 + active 파생', () => {
    it('isVerified면 syncChannelUsers만으로 입장 시 전체 스냅샷을 since:0으로 로드한다', async () => {
        renderHook(() => useChannelMembers({ channelId: 'c1', detail: true }));

        await waitFor(() => expect(syncChannelUsers).toHaveBeenCalledTimes(1));
        expect(syncChannelUsers).toHaveBeenCalledWith({ channelId: 'c1', since: 0 });
    });

    it('isVerified가 아니면 네트워크 로드를 하지 않는다', () => {
        (useSocketState as jest.Mock).mockReturnValue({ isVerified: false });

        renderHook(() => useChannelMembers({ channelId: 'c1' }));

        expect(syncChannelUsers).not.toHaveBeenCalled();
    });

    it('activeMemberIds는 joined !== 0 인 멤버만 중복 없이 포함한다', () => {
        seedJoins([join('u1', 1), join('u2', 0), join('u3', 2), join('u1', 1)]);

        const { result } = renderHook(() => useChannelMembers({ channelId: 'c1' }));

        expect(result.current.activeMemberIds).toEqual(['u1', 'u3']);
    });
});
