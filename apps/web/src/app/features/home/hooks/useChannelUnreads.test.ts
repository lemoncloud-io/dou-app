import { renderHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

import { useChannelUnreads } from './useChannelUnreads';

// Build a channel with an optional embedded `$join` (the current user's read boundary).
const channel = (id: string, fields: Partial<DomainChannel>): DomainChannel =>
    ({ id, ...fields }) as unknown as DomainChannel;

const withJoin = (chatNo: number | undefined): DomainChannel['$join'] => ({ chatNo }) as DomainChannel['$join'];

describe('useChannelUnreads — 채널 안읽음 계산', () => {
    it('unread = lastChat chatNo - 내 $join chatNo, 음수는 0으로 보정한다', () => {
        const channels = [
            channel('c1', { lastChat$: { chatNo: 7 } as DomainChannel['lastChat$'], $join: withJoin(3) }),
            channel('c2', { lastChat$: { chatNo: 8 } as DomainChannel['lastChat$'], $join: withJoin(10) }),
        ];

        const { result } = renderHook(() => useChannelUnreads(channels));

        expect(result.current.byChannel).toEqual({ c1: 4, c2: 0 });
        expect(result.current.total).toBe(4);
    });

    it('$join이 없는 채널은 읽음 기준이 없어 배지를 띄우지 않는다 (0)', () => {
        const channels = [
            channel('c1', { lastChat$: { chatNo: 7 } as DomainChannel['lastChat$'], $join: withJoin(3) }),
            // no $join → no read boundary yet → 0 (no badge)
            channel('c2', { lastChat$: { chatNo: 5 } as DomainChannel['lastChat$'] }),
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
        const channels = [
            channel('c1', { lastChat$: { chatNo: 5 } as DomainChannel['lastChat$'], $join: withJoin(undefined) }),
        ];

        const { result } = renderHook(() => useChannelUnreads(channels));

        expect(result.current.byChannel.c1).toBe(5);
    });
});
