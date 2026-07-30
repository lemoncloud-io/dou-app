import { renderHook } from '@testing-library/react';

import { CHANNEL_PROBE_DELAYS_MS, useResolveInviteChannel } from './useResolveInviteChannel';

const awaitChannel = jest.fn();
const getInvite = jest.fn();

jest.mock('../../../hooks', () => ({
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

        expect(awaitChannel).toHaveBeenCalledWith({ knownChannelIds: known, timeoutMs: 5_000, pollMs: 1_000 });
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
