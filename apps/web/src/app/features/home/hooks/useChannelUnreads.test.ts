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
    it('unread = (chatNo - metaNo) - 내 join 커서, 음수는 0으로 보정한다', () => {
        // c1: userHead = 7 - 0 = 7, cursor 3 → 4. c2: userHead 8, cursor 10 → 0.
        const channels = [channel('c1', { chatNo: 7 }), channel('c2', { chatNo: 8 })];
        const joins = joinMap({ c1: join({ chatNo: 3 }), c2: join({ chatNo: 10 }) });

        const { result } = renderHook(() => useChannelUnreads(channels, joins));

        expect(result.current.byChannel).toEqual({ c1: 4, c2: 0 });
        expect(result.current.total).toBe(4);
    });

    it('시스템 메시지(metaNo)는 head에서 빠져 안읽음에 포함되지 않는다', () => {
        // chatNo 10 중 metaNo 3이 시스템 → userHead 7. 커서 3 → 4 (시스템 제외).
        const channels = [channel('c1', { chatNo: 10, metaNo: 3 })];
        const joins = joinMap({ c1: join({ chatNo: 3 }) });

        expect(renderHook(() => useChannelUnreads(channels, joins)).result.current.byChannel.c1).toBe(4);
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

    it('커서는 max(readNo, chatNo)로 가장 최근 읽음 위치를 사용한다', () => {
        // userHead 8; readNo 6 vs chatNo 2 → 커서 6 → 2.
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
