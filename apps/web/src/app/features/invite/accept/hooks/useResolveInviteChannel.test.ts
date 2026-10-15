import { renderHook } from '@testing-library/react';

import {
    CHANNEL_PROBE_DELAYS_MS,
    ROOM_PUSH_WAIT_MS,
    isInviterJoinToNewRoom,
    useResolveInviteChannel,
} from './useResolveInviteChannel';

const awaitChannel = jest.fn();
const getInvite = jest.fn();
// The relay slot's `join.sync` subscription: the test pushes through `pushJoin`.
const joinListeners = new Set<(message: { data: unknown }) => void>();
const unsubscribeJoin = jest.fn();
const pushJoin = (data: unknown) => joinListeners.forEach(listener => listener({ data }));

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        connection: {
            RELAY_SLOT: 'default',
            getSocketManager: () => ({
                getScopedClient: () => ({
                    onType: (_type: string, listener: (message: { data: unknown }) => void) => {
                        joinListeners.add(listener);
                        return () => {
                            unsubscribeJoin();
                            joinListeners.delete(listener);
                        };
                    },
                }),
            }),
        },
    },
}));

jest.mock('../../../../hooks', () => ({
    useAwaitInviteChannel: () => ({ awaitChannel }),
    useRelayInviteMutations: () => ({ getInvite }),
}));

const CODE = 'invt:1:secret';

/** Two short probes — the real cadence would make every tier-3 test wait seconds of wall clock. */
const PROBES = [0, 10];

const mount = () => renderHook(() => useResolveInviteChannel());

/** Let pending microtasks (probe round-trips) settle without advancing the clock. */
const flush = async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

beforeEach(() => {
    jest.clearAllMocks();
    joinListeners.clear();
    jest.useFakeTimers();
    getInvite.mockResolvedValue({ id: 'inv-1', state: 'accepted' });
    awaitChannel.mockResolvedValue('ch-from-list');
});

afterEach(() => {
    jest.useRealTimers();
});

describe('useResolveInviteChannel — 1단 (수락 응답 직독)', () => {
    it('수락 응답에 channelId가 있으면 그대로 쓰고 2·3단을 건너뛴다', async () => {
        const { result } = mount();

        await expect(result.current.resolveChannel(CODE, { acceptedChannelId: 'ch-accepted' })).resolves.toBe(
            'ch-accepted'
        );

        expect(getInvite).not.toHaveBeenCalled();
        expect(awaitChannel).not.toHaveBeenCalled();
    });
});

describe('useResolveInviteChannel — 2단 (invite.get 재조회)', () => {
    it('첫 프로브에서 channelId가 오면 지연 없이 해소하고 3단을 부르지 않는다', async () => {
        getInvite.mockResolvedValue({ id: 'inv-1', channelId: 'ch-probed' });
        const { result } = mount();

        const pending = result.current.resolveChannel(CODE, { probeDelaysMs: PROBES });
        await flush();

        await expect(pending).resolves.toBe('ch-probed');
        expect(getInvite).toHaveBeenCalledTimes(1);
        expect(getInvite).toHaveBeenCalledWith(CODE);
        expect(awaitChannel).not.toHaveBeenCalled();
    });

    it('나중 프로브에서 채워져도 해소한다', async () => {
        getInvite.mockResolvedValueOnce({ id: 'inv-1' }).mockResolvedValue({ id: 'inv-1', channelId: 'ch-late' });
        const { result } = mount();

        const pending = result.current.resolveChannel(CODE, { probeDelaysMs: PROBES });
        await flush();
        await jest.advanceTimersByTimeAsync(10);

        await expect(pending).resolves.toBe('ch-late');
        expect(getInvite).toHaveBeenCalledTimes(2);
        expect(awaitChannel).not.toHaveBeenCalled();
    });

    it('프로브는 channelId만 읽는다 — state=accepted를 실패로 보지 않는다', async () => {
        getInvite.mockResolvedValue({ id: 'inv-1', state: 'accepted', channelId: 'ch-probed' });
        const { result } = mount();

        const pending = result.current.resolveChannel(CODE, { probeDelaysMs: PROBES });
        await flush();

        await expect(pending).resolves.toBe('ch-probed');
    });
});

describe('useResolveInviteChannel — 3단 (채널 목록 감시) 폴백', () => {
    it('프로브가 끝까지 비면 목록 감시로 내려간다', async () => {
        getInvite.mockResolvedValue({ id: 'inv-1' });
        const { result } = mount();

        const pending = result.current.resolveChannel(CODE, { probeDelaysMs: PROBES });
        await flush();
        await jest.advanceTimersByTimeAsync(10);

        await expect(pending).resolves.toBe('ch-from-list');
        expect(getInvite).toHaveBeenCalledTimes(2);
        expect(awaitChannel).toHaveBeenCalledTimes(1);
    });

    it('프로브가 에러를 던져도 흐름을 끊지 않고 목록 감시로 내려간다', async () => {
        getInvite.mockRejectedValue(new Error('500 SERVER ERROR - nope'));
        const { result } = mount();

        const pending = result.current.resolveChannel(CODE, { probeDelaysMs: PROBES });
        await flush();
        await jest.advanceTimersByTimeAsync(10);

        await expect(pending).resolves.toBe('ch-from-list');
        expect(awaitChannel).toHaveBeenCalledTimes(1);
    });

    it('3단도 못 찾으면 null이다 — 절대 reject하지 않는다', async () => {
        getInvite.mockResolvedValue({ id: 'inv-1' });
        awaitChannel.mockResolvedValue(null);
        const { result } = mount();

        const pending = result.current.resolveChannel(CODE, { probeDelaysMs: PROBES });
        await flush();
        await jest.advanceTimersByTimeAsync(10);

        await expect(pending).resolves.toBeNull();
    });

    it('3단 옵션(knownChannelIds·timeoutMs·pollMs)을 그대로 넘긴다', async () => {
        getInvite.mockResolvedValue({ id: 'inv-1' });
        const known = ['a', 'b'];
        const { result } = mount();

        const pending = result.current.resolveChannel(CODE, {
            probeDelaysMs: PROBES,
            knownChannelIds: known,
            timeoutMs: 5_000,
            pollMs: 1_000,
        });
        await flush();
        await jest.advanceTimersByTimeAsync(10);
        await pending;

        expect(awaitChannel).toHaveBeenCalledWith(
            expect.objectContaining({ knownChannelIds: known, timeoutMs: 5_000, pollMs: 1_000 })
        );
    });
});

describe('useResolveInviteChannel — 정리', () => {
    it('언마운트되면 프로브 루프를 조기 종료하고 3단도 부르지 않는다', async () => {
        getInvite.mockResolvedValue({ id: 'inv-1' });
        const { result, unmount } = mount();

        const pending = result.current.resolveChannel(CODE, { probeDelaysMs: PROBES });
        await flush();
        unmount();
        await jest.advanceTimersByTimeAsync(10);

        await expect(pending).resolves.toBeNull();
        expect(awaitChannel).not.toHaveBeenCalled();
    });

    it('기본 cadence는 즉시 1회 + 지연 1회다 — 첫 프로브는 지연이 없어야 한다', () => {
        expect(CHANNEL_PROBE_DELAYS_MS[0]).toBe(0);
        expect(CHANNEL_PROBE_DELAYS_MS).toHaveLength(2);
    });
});

describe('isInviterJoinToNewRoom', () => {
    it("accepts the inviter's join to a 1:1 room that names them", () => {
        expect(isInviterJoinToNewRoom({ channelId: '1001976@1001984', userId: '1001976' }, '1001976')).toBe(true);
    });

    it("ignores another member's join, a group room, and a push with no room", () => {
        expect(isInviterJoinToNewRoom({ channelId: '1001976@1001984', userId: '1001984' }, '1001976')).toBe(false);
        expect(isInviterJoinToNewRoom({ channelId: '1000004', userId: '1001976' }, '1001976')).toBe(false);
        expect(isInviterJoinToNewRoom({ userId: '1001976' }, '1001976')).toBe(false);
        expect(isInviterJoinToNewRoom(null, '1001976')).toBe(false);
    });
});

describe('useResolveInviteChannel — the room push', () => {
    const INVITER = '1001976';

    it('resolves on the inviter join push without waiting out the probes or reaching tier 3', async () => {
        getInvite.mockResolvedValue({ id: 'inv-1' });
        const onResolved = jest.fn();
        const { result } = mount();

        let resolved: string | null | undefined;
        void result.current.resolveChannel(CODE, { inviterId: INVITER, onResolved }).then(id => {
            resolved = id;
        });
        await flush();
        // The dev server pushed the inviter's join about a second after the accept answered.
        await jest.advanceTimersByTimeAsync(1_000);
        pushJoin({ channelId: '1001976@1001984', userId: INVITER });
        await flush();

        expect(resolved).toBe('1001976@1001984');
        expect(onResolved).toHaveBeenCalledWith('push');
        expect(unsubscribeJoin).toHaveBeenCalledTimes(1);

        // The second probe and tier 3 never run once the push has answered.
        await jest.advanceTimersByTimeAsync(5_000);
        expect(getInvite).toHaveBeenCalledTimes(1);
        expect(awaitChannel).not.toHaveBeenCalled();
    });

    it('ignores pushes about other rooms and keeps to the tiers', async () => {
        getInvite.mockResolvedValue({ id: 'inv-1' });
        const onResolved = jest.fn();
        const { result } = mount();

        const pending = result.current.resolveChannel(CODE, { inviterId: INVITER, onResolved, probeDelaysMs: PROBES });
        await flush();
        pushJoin({ channelId: '1000004', userId: INVITER });
        await jest.advanceTimersByTimeAsync(10);

        await expect(pending).resolves.toBe('ch-from-list');
        expect(onResolved).toHaveBeenCalledWith('list');
        expect(unsubscribeJoin).toHaveBeenCalledTimes(1);
    });

    it('does not subscribe without an inviter', async () => {
        getInvite.mockResolvedValue({ id: 'inv-1', channelId: 'ch-probed' });
        const onResolved = jest.fn();
        const { result } = mount();

        const pending = result.current.resolveChannel(CODE, { onResolved, probeDelaysMs: PROBES });
        await flush();

        await expect(pending).resolves.toBe('ch-probed');
        expect(onResolved).toHaveBeenCalledWith('probe');
        expect(joinListeners.size).toBe(0);
    });

    it('stops tier 3 polling when the push wins while tier 3 is running', async () => {
        getInvite.mockResolvedValue({ id: 'inv-1' });
        let tierThreeSignal: AbortSignal | undefined;
        awaitChannel.mockImplementation(
            (options: { signal?: AbortSignal }) =>
                new Promise(resolve => {
                    tierThreeSignal = options.signal;
                    options.signal?.addEventListener('abort', () => resolve(null));
                })
        );
        const { result } = mount();

        const pending = result.current.resolveChannel(CODE, { inviterId: INVITER, probeDelaysMs: PROBES });
        await jest.advanceTimersByTimeAsync(10);
        expect(awaitChannel).toHaveBeenCalledTimes(1);
        pushJoin({ channelId: '1001976@1001984', userId: INVITER });

        await expect(pending).resolves.toBe('1001976@1001984');
        expect(tierThreeSignal?.aborted).toBe(true);
    });

    it('still takes a push that arrives after the tiers gave up for want of a place', async () => {
        getInvite.mockResolvedValue({ id: 'inv-1' });
        // No active place: tier 3 answers null at once.
        awaitChannel.mockResolvedValue(null);
        const onResolved = jest.fn();
        const { result } = mount();

        const pending = result.current.resolveChannel(CODE, { inviterId: INVITER, onResolved, probeDelaysMs: PROBES });
        await jest.advanceTimersByTimeAsync(2_000);
        pushJoin({ channelId: '1001976@1001984', userId: INVITER });

        await expect(pending).resolves.toBe('1001976@1001984');
        expect(onResolved).toHaveBeenCalledWith('push');
    });

    it('treats a throw inside the tiers as a room not found, never rejecting', async () => {
        getInvite.mockResolvedValue({ id: 'inv-1' });
        awaitChannel.mockRejectedValue(new Error('cache read failed'));
        const onResolved = jest.fn();
        const { result } = mount();

        const pending = result.current.resolveChannel(CODE, { onResolved, probeDelaysMs: PROBES });
        await jest.advanceTimersByTimeAsync(10);

        await expect(pending).resolves.toBeNull();
        expect(onResolved).toHaveBeenCalledWith('none');
    });

    it('reports a room the accept response carried as the response', async () => {
        const onResolved = jest.fn();
        const { result } = mount();

        await expect(
            result.current.resolveChannel(CODE, { acceptedChannelId: 'ch-accepted', inviterId: INVITER, onResolved })
        ).resolves.toBe('ch-accepted');
        expect(onResolved).toHaveBeenCalledWith('response');
        expect(joinListeners.size).toBe(0);
    });

    it('reports none when nothing found the room, once the push has had its window', async () => {
        getInvite.mockResolvedValue({ id: 'inv-1' });
        awaitChannel.mockResolvedValue(null);
        const onResolved = jest.fn();
        const { result } = mount();

        let resolved: string | null | undefined;
        void result.current.resolveChannel(CODE, { inviterId: INVITER, onResolved, probeDelaysMs: PROBES }).then(id => {
            resolved = id;
        });
        await jest.advanceTimersByTimeAsync(ROOM_PUSH_WAIT_MS - 100);
        expect(resolved).toBeUndefined();
        await jest.advanceTimersByTimeAsync(200);

        expect(resolved).toBeNull();
        expect(onResolved).toHaveBeenCalledWith('none');
        expect(unsubscribeJoin).toHaveBeenCalledTimes(1);
    });
});
