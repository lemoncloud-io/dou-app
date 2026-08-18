import { renderHook } from '@testing-library/react';

import type { DomainChannel, DomainJoin } from '@chatic/data';

import { useChannelUnreads } from './useChannelUnreads';

// Build a channel head. `chatNo` is the unified user+system sequence; `metaNo` the system count.
const channel = (id: string, fields: Partial<DomainChannel>): DomainChannel =>
    ({ id, ...fields }) as unknown as DomainChannel;

// My read cursor for a channel, as it arrives from the subscribed join list.
const join = (fields: Partial<DomainJoin>): DomainJoin => fields as DomainJoin;

const joinMap = (entries: Record<string, DomainJoin>): Map<string, DomainJoin> => new Map(Object.entries(entries));

describe('useChannelUnreads — 채널 안읽음 계산', () => {
    it('unread = countUnread(head, read cursor) 이고 음수는 0으로 보정한다', () => {
        // c1: userHead = 7, cursor 3 → 4. c2: userHead 8, cursor 10 → 0.
        const channels = [channel('c1', { chatNo: 7 }), channel('c2', { chatNo: 8 })];
        const joins = joinMap({ c1: join({ chatNo: 3 }), c2: join({ chatNo: 10 }) });

        const { result } = renderHook(() => useChannelUnreads(channels, joins));

        expect(result.current.byChannel).toEqual({ c1: 4, c2: 0 });
        expect(result.current.total).toBe(4);
    });

    it('시스템 메시지(metaNo)는 head와 join 둘 다에서 빠진다 (ADR-0048)', () => {
        // userHead = 10 - 3 = 7. join.chatNo 3, join.metaNo 1 → unread 5.
        const channels = [channel('c1', { chatNo: 10, metaNo: 3 })];
        const joins = joinMap({ c1: join({ chatNo: 3, metaNo: 1 }) });

        expect(renderHook(() => useChannelUnreads(channels, joins)).result.current.byChannel.c1).toBe(5);
    });

    it('join 행이 없는 채널은 읽음 기준이 없어 배지를 띄우지 않는다 (0)', () => {
        const channels = [channel('c1', { chatNo: 7 }), channel('c2', { chatNo: 5 })];
        const joins = joinMap({ c1: join({ chatNo: 3 }) }); // c2 has no synced join yet

        const { result } = renderHook(() => useChannelUnreads(channels, joins));

        expect(result.current.byChannel).toEqual({ c1: 4, c2: 0 });
        expect(result.current.total).toBe(4);
    });

    it('join 맵이 없으면 모든 채널이 0이다 (커서 미확보)', () => {
        const channels = [channel('c1', { chatNo: 7 })];

        expect(renderHook(() => useChannelUnreads(channels)).result.current.byChannel.c1).toBe(0);
    });

    it('join.readNo와 join.chatNo 중 더 최신 읽음 경계를 사용한다', () => {
        // userHead 8; readNo 6 vs chatNo 2 → cursor 6 → 2.
        const channels = [channel('c1', { chatNo: 8 })];
        const joins = joinMap({ c1: join({ readNo: 6, chatNo: 2 }) });

        expect(renderHook(() => useChannelUnreads(channels, joins)).result.current.byChannel.c1).toBe(2);
    });

    it('chatNo가 없으면 head는 0이다 (서버가 더 이상 보내지 않는 lastChat$에 기대지 않는다)', () => {
        const channels = [channel('c1', { lastChat$: { chatNo: 6 } as DomainChannel['lastChat$'] })];
        const joins = joinMap({ c1: join({ chatNo: 2 }) });

        expect(renderHook(() => useChannelUnreads(channels, joins)).result.current.byChannel.c1).toBe(0);
    });

    it('byPlace는 사이트(sid)별로 안읽음을 합산한다', () => {
        const channels = [
            channel('c1', { sid: 's1', chatNo: 10 }), // cursor 7 → 3
            channel('c2', { sid: 's1', chatNo: 5 }), // cursor 1 → 4
            channel('c3', { sid: 's2', chatNo: 8 }), // cursor 6 → 2
        ];
        const joins = joinMap({ c1: join({ chatNo: 7 }), c2: join({ chatNo: 1 }), c3: join({ chatNo: 6 }) });

        const { result } = renderHook(() => useChannelUnreads(channels, joins));

        expect(result.current.byPlace).toEqual({ s1: 7, s2: 2 });
        expect(result.current.total).toBe(9);
    });
});
