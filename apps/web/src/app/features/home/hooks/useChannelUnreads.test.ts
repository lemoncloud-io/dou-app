import { renderHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

import { useChannelUnreads } from './useChannelUnreads';

// Build a channel with an optional embedded `$join` (the current user's read boundary).
const channel = (id: string, fields: Partial<DomainChannel>): DomainChannel =>
    ({ id, ...fields }) as unknown as DomainChannel;

const withJoin = (chatNo: number | undefined): DomainChannel['$join'] => ({ chatNo }) as DomainChannel['$join'];

// Read cursor carrying both chatNo and the metaNo observed at that point (server may deliver it
// on the join payload even though the published type omits it).
const withJoinMeta = (chatNo: number, metaNo: number): DomainChannel['$join'] =>
    ({ chatNo, metaNo }) as DomainChannel['$join'];

const lastChat = (chatNo: number): DomainChannel['lastChat$'] => ({ chatNo }) as DomainChannel['lastChat$'];

describe('useChannelUnreads — 채널 안읽음 계산', () => {
    it('unread = lastChat chatNo - 내 $join chatNo, 음수는 0으로 보정한다', () => {
        const channels = [
            channel('c1', { lastChat$: lastChat(7), $join: withJoin(3) }),
            channel('c2', { lastChat$: lastChat(8), $join: withJoin(10) }),
        ];

        const { result } = renderHook(() => useChannelUnreads(channels));

        expect(result.current.byChannel).toEqual({ c1: 4, c2: 0 });
        expect(result.current.total).toBe(4);
    });

    it('$join이 없는 채널은 읽음 기준이 없어 배지를 띄우지 않는다 (0)', () => {
        const channels = [
            channel('c1', { lastChat$: lastChat(7), $join: withJoin(3) }),
            channel('c2', { lastChat$: lastChat(5) }), // no $join → no read boundary yet → 0
        ];

        const { result } = renderHook(() => useChannelUnreads(channels));

        expect(result.current.byChannel).toEqual({ c1: 4, c2: 0 });
        expect(result.current.total).toBe(4);
    });

    it('lastChat$이 없으면 channel.chatNo를 최신 번호로 사용한다', () => {
        const channels = [channel('c1', { chatNo: 6, $join: withJoin(2) } as Partial<DomainChannel>)];

        const { result } = renderHook(() => useChannelUnreads(channels));

        expect(result.current.byChannel.c1).toBe(4);
        expect(result.current.total).toBe(4);
    });

    it('$join은 있으나 chatNo가 없으면 0부터 읽은 것으로 보아 전부 안읽음으로 센다', () => {
        const channels = [channel('c1', { lastChat$: lastChat(5), $join: withJoin(undefined) })];

        const { result } = renderHook(() => useChannelUnreads(channels));

        expect(result.current.byChannel.c1).toBe(5);
    });

    it('byPlace는 사이트(sid)별로 안읽음을 합산한다', () => {
        const channels = [
            channel('c1', { sid: 's1', lastChat$: lastChat(10), $join: withJoin(7) }), // 3
            channel('c2', { sid: 's1', lastChat$: lastChat(5), $join: withJoin(1) }), // 4
            channel('c3', { sid: 's2', lastChat$: lastChat(8), $join: withJoin(6) }), // 2
        ];

        const { result } = renderHook(() => useChannelUnreads(channels));

        expect(result.current.byPlace).toEqual({ s1: 7, s2: 2 });
        expect(result.current.total).toBe(9);
    });

    describe('시스템 메시지 보정 (metaNo)', () => {
        it('읽음 이후 생긴 시스템 메시지는 안읽음에서 뺀다', () => {
            // latest=10, read=3 → raw 7. 읽음 시점 meta=1, 현재 meta=3 → 윈도우 내 시스템 2건 → 5.
            const channels = [channel('c1', { lastChat$: lastChat(10), metaNo: 3, $join: withJoinMeta(3, 1) })];

            expect(renderHook(() => useChannelUnreads(channels)).result.current.byChannel.c1).toBe(5);
        });

        it('윈도우가 전부 시스템 메시지면 안읽음 0이다', () => {
            // latest=6, read=4 → raw 2. meta가 4→6으로 2 증가 → 사용자 메시지 0.
            const channels = [channel('c1', { lastChat$: lastChat(6), metaNo: 6, $join: withJoinMeta(4, 4) })];

            expect(renderHook(() => useChannelUnreads(channels)).result.current.byChannel.c1).toBe(0);
        });

        it('join.metaNo가 없으면 보정 없이 기존 동작으로 degrade한다', () => {
            // metaNo는 채널에 있으나 읽음 커서엔 없음 → readMeta=latestMeta → 보정 0 → raw 7.
            const channels = [channel('c1', { lastChat$: lastChat(10), metaNo: 3, $join: withJoin(3) })];

            expect(renderHook(() => useChannelUnreads(channels)).result.current.byChannel.c1).toBe(7);
        });

        it('stale readMeta(현재 meta보다 큼)가 안읽음을 부풀리지 않는다', () => {
            // readMeta=5 > latestMeta=2 → systemInWindow는 0으로 clamp → raw 그대로 5.
            const channels = [channel('c1', { lastChat$: lastChat(8), metaNo: 2, $join: withJoinMeta(3, 5) })];

            expect(renderHook(() => useChannelUnreads(channels)).result.current.byChannel.c1).toBe(5);
        });
    });
});
