import { renderHook, waitFor } from '@testing-library/react';

import { runtime, type DomainJoin } from '@chatic/runtime';

import { useChannelMembers } from './useChannelMembers';

jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        data: {
            useRuntimeRepositories: jest.fn(),
        },
        connection: {
            useRuntimeSocketState: jest.fn(),
        },
    })
);

const userObserveList = jest.fn();
const syncChannelUsers = jest.fn();

const join = (userId: string, joined: number, fields: Partial<DomainJoin> = {}): DomainJoin =>
    ({ userId, joined, ...fields }) as unknown as DomainJoin;

const seedUsers = (rows: Array<{ id: string }>) =>
    userObserveList.mockImplementation((_q, cb) => {
        cb({ list: rows });
        return () => undefined;
    });

beforeEach(() => {
    jest.clearAllMocks();
    seedUsers([]);
    syncChannelUsers.mockResolvedValue(42);
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({
        user: { observeList: userObserveList, syncChannelUsers },
    });
    (runtime.connection.useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: true });
});

describe('useChannelMembers — 멤버 적재 + active 파생', () => {
    it('isVerified면 syncChannelUsers만으로 입장 시 전체 스냅샷을 since:0으로 로드한다', async () => {
        renderHook(() => useChannelMembers({ channelId: 'c1', detail: true, joins: [] }));

        await waitFor(() => expect(syncChannelUsers).toHaveBeenCalledTimes(1));
        expect(syncChannelUsers).toHaveBeenCalledWith({ channelId: 'c1', since: 0 });
    });

    it('isVerified가 아니면 네트워크 로드를 하지 않는다', () => {
        (runtime.connection.useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: false });

        renderHook(() => useChannelMembers({ channelId: 'c1', joins: [] }));

        expect(syncChannelUsers).not.toHaveBeenCalled();
    });

    describe('멤버십 축', () => {
        it('user 캐시가 비어도 로스터만으로 멤버를 만든다 (self 방: 나 혼자)', () => {
            seedUsers([]);

            const { result } = renderHook(() => useChannelMembers({ channelId: 'c1', memberIds: ['me'], joins: [] }));

            expect(result.current.members.map(m => m.id)).toEqual(['me']);
        });

        it('user 캐시가 비어도 join 행만으로 멤버를 만든다', () => {
            seedUsers([]);

            const { result } = renderHook(() => useChannelMembers({ channelId: 'c1', joins: [join('me', 1)] }));

            expect(result.current.members.map(m => m.id)).toEqual(['me']);
            expect(result.current.members[0].$join?.joined).toBe(1);
        });

        it('user 캐시가 있으면 신원을 붙이고 join도 함께 매단다', () => {
            seedUsers([{ id: 'u1', name: '레모닝' } as { id: string }]);

            const { result } = renderHook(() =>
                useChannelMembers({ channelId: 'c1', memberIds: ['u1'], joins: [join('u1', 1, { nick: '방별명' })] })
            );

            expect(result.current.members).toHaveLength(1);
            expect(result.current.members[0]).toMatchObject({ id: 'u1', name: '레모닝' });
            expect(result.current.members[0].$join?.nick).toBe('방별명');
        });

        it('로스터 순서를 지키고, 로스터에 없는 멤버는 뒤에 한 번만 붙인다', () => {
            seedUsers([{ id: 'u3' } as { id: string }]);

            const { result } = renderHook(() =>
                useChannelMembers({ channelId: 'c1', memberIds: ['u1', 'u2'], joins: [join('u2', 1)] })
            );

            expect(result.current.members.map(m => m.id)).toEqual(['u1', 'u2', 'u3']);
        });

        it('join 스트림만 emit해도 로딩이 풀린다 (user 캐시는 sync plan이 없다)', () => {
            userObserveList.mockImplementation(() => () => undefined);

            const { result } = renderHook(() => useChannelMembers({ channelId: 'c1', joins: [join('me', 1)] }));

            expect(result.current.isLoading).toBe(false);
            expect(result.current.members.map(m => m.id)).toEqual(['me']);
        });
    });
});
