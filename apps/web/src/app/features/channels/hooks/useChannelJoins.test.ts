import { renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/app-runtime';
import type { DomainJoin } from '@chatic/data';

import { useChannelJoins } from './useChannelJoins';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
    useSessionIdentity: jest.fn(),
}));

const observeList = jest.fn();

const join = (userId: string, fields: Partial<DomainJoin> = {}): DomainJoin =>
    ({ userId, joined: 1, ...fields }) as unknown as DomainJoin;

const seed = (rows: DomainJoin[]) => {
    const dispose = jest.fn();
    observeList.mockImplementation((_q, cb) => {
        cb({ list: rows });
        return dispose;
    });
    return dispose;
};

beforeEach(() => {
    jest.clearAllMocks();
    seed([]);
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ join: { observeList } });
    (useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'me' });
});

describe('useChannelJoins — 방의 단일 join 관측', () => {
    it('activeOnly:false로 한 번만 관측한다 (떠난 사람의 행도 봐야 하므로)', () => {
        seed([join('me')]);

        renderHook(() => useChannelJoins('c1'));

        expect(observeList).toHaveBeenCalledTimes(1);
        expect(observeList).toHaveBeenCalledWith({ channelId: 'c1', activeOnly: false }, expect.any(Function));
    });

    it('내 행을 userId로 골라준다 (방별 설정·읽음 경계의 출처)', () => {
        seed([join('u1'), join('me', { nick: '내 방별명' })]);

        const { result } = renderHook(() => useChannelJoins('c1'));

        expect(result.current.myJoin?.nick).toBe('내 방별명');
    });

    it('내 행이 아직 없으면 myJoin은 null이다', () => {
        seed([join('u1')]);

        const { result } = renderHook(() => useChannelJoins('c1'));

        expect(result.current.myJoin).toBeNull();
    });

    it('activeMemberIds는 joined !== 0 인 멤버만 중복 없이 포함한다', () => {
        seed([
            join('u1', { joined: 1 }),
            join('u2', { joined: 0 }),
            join('u3', { joined: 2 }),
            join('u1', { joined: 1 }),
        ]);

        const { result } = renderHook(() => useChannelJoins('c1'));

        expect(result.current.activeMemberIds).toEqual(['u1', 'u3']);
    });

    it('커서는 max(readNo, chatNo)다 (내 행은 readChat의 낙관적 패치로 readNo가 앞선다)', () => {
        seed([join('u1', { readNo: 5, chatNo: 3 }), join('u2', { readNo: 1, chatNo: 4 })]);

        const { result } = renderHook(() => useChannelJoins('c1'));

        expect(result.current.cursorByUser.get('u1')).toBe(5);
        expect(result.current.cursorByUser.get('u2')).toBe(4);
    });

    it('channelId가 없으면 관측하지 않고 빈 값을 낸다', () => {
        const { result } = renderHook(() => useChannelJoins(null));

        expect(observeList).not.toHaveBeenCalled();
        expect(result.current.joins).toEqual([]);
        expect(result.current.myJoin).toBeNull();
        expect(result.current.activeMemberIds).toEqual([]);
        expect(result.current.cursorByUser.size).toBe(0);
    });

    it('방을 옮기면 이전 관측을 해제하고 다시 구독한다', () => {
        const dispose = seed([join('me')]);

        const { rerender } = renderHook(({ id }) => useChannelJoins(id), { initialProps: { id: 'c1' } });
        rerender({ id: 'c2' });

        expect(dispose).toHaveBeenCalledTimes(1);
        expect(observeList).toHaveBeenLastCalledWith({ channelId: 'c2', activeOnly: false }, expect.any(Function));
    });
});
