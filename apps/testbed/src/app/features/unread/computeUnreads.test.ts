import { describe, expect, it } from 'vitest';

import type { DomainChannel } from '@chatic/data';

import { computeUnreads } from './computeUnreads';

const channel = (fields: Partial<DomainChannel>): DomainChannel => fields as unknown as DomainChannel;

describe('computeUnreads', () => {
    it('unread = 최신 chatNo - $join.chatNo, 음수는 0으로 클램프한다', () => {
        const { byChannel, total } = computeUnreads([
            channel({ id: 'a', sid: 's1', lastChat$: { chatNo: 10 } as any, $join: { chatNo: 3 } as any }),
            channel({ id: 'b', sid: 's1', lastChat$: { chatNo: 5 } as any, $join: { chatNo: 9 } as any }),
        ]);
        expect(byChannel).toEqual({ a: 7, b: 0 });
        expect(total).toBe(7);
    });

    it('$join이 아직 없으면(미동기화) 안읽음은 0이다', () => {
        const { byChannel, total } = computeUnreads([channel({ id: 'a', sid: 's1', lastChat$: { chatNo: 8 } as any })]);
        expect(byChannel).toEqual({ a: 0 });
        expect(total).toBe(0);
    });

    it('lastChat$가 없으면 channel.chatNo로 폴백한다', () => {
        const { byChannel } = computeUnreads([channel({ id: 'a', sid: 's1', chatNo: 6, $join: { chatNo: 2 } as any })]);
        expect(byChannel).toEqual({ a: 4 });
    });

    it('$join.chatNo가 undefined면 0부터 읽은 것으로 보아 전부 안읽음이다', () => {
        const { byChannel } = computeUnreads([
            channel({ id: 'a', sid: 's1', lastChat$: { chatNo: 4 } as any, $join: {} as any }),
        ]);
        expect(byChannel).toEqual({ a: 4 });
    });

    it('byPlace는 사이트(sid)별로 안읽음을 합산한다', () => {
        const { byPlace, total } = computeUnreads([
            channel({ id: 'a', sid: 's1', lastChat$: { chatNo: 10 } as any, $join: { chatNo: 7 } as any }),
            channel({ id: 'b', sid: 's1', lastChat$: { chatNo: 5 } as any, $join: { chatNo: 1 } as any }),
            channel({ id: 'c', sid: 's2', lastChat$: { chatNo: 3 } as any, $join: { chatNo: 1 } as any }),
        ]);
        expect(byPlace).toEqual({ s1: 7, s2: 2 });
        expect(total).toBe(9);
    });

    it('시스템 메시지(metaNo)는 안읽음 창에서 차감한다', () => {
        // latest=10, read=3 → raw 7. metaNo 1→3 (시스템 2건) → 사용자 메시지 5건.
        const { byChannel } = computeUnreads([
            channel({
                id: 'a',
                sid: 's1',
                metaNo: 3,
                lastChat$: { chatNo: 10 } as any,
                $join: { chatNo: 3, metaNo: 1 } as any,
            }),
        ]);
        expect(byChannel).toEqual({ a: 5 });
    });

    it('join에 metaNo가 없으면 보정하지 않는다(안전하게 degrade)', () => {
        const { byChannel } = computeUnreads([
            channel({ id: 'a', sid: 's1', metaNo: 3, lastChat$: { chatNo: 10 } as any, $join: { chatNo: 3 } as any }),
        ]);
        expect(byChannel).toEqual({ a: 7 });
    });
});
