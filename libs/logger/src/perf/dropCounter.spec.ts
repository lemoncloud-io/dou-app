import { noteQueueDrops, readQueueDropTotal, resetQueueDropTotal } from './dropCounter';

describe('dropCounter', () => {
    beforeEach(() => resetQueueDropTotal());

    it('아무것도 버려지지 않았으면 0이다', () => {
        expect(readQueueDropTotal()).toBe(0);
    });

    it('누적한다 — 읽어도 소진되지 않는다', () => {
        noteQueueDrops(3);
        noteQueueDrops(4);

        expect(readQueueDropTotal()).toBe(7);
        expect(readQueueDropTotal()).toBe(7);
    });

    it('0 이하는 무시한다', () => {
        noteQueueDrops(0);
        noteQueueDrops(-5);

        expect(readQueueDropTotal()).toBe(0);
    });
});
