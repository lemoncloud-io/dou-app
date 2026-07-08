import { createRingBuffer } from './ringBuffer';

describe('createRingBuffer', () => {
    it('push한 순서대로(FIFO) peek로 조회하고 버퍼를 유지한다', () => {
        const buffer = createRingBuffer<number>(5);
        buffer.push(1);
        buffer.push(2);
        buffer.push(3);

        expect(buffer.peek()).toEqual([1, 2, 3]);
        expect(buffer.peek(2)).toEqual([1, 2]);
        expect(buffer.size()).toBe(3);
    });

    it('용량을 초과하면 가장 오래된 항목부터 덮어쓴다', () => {
        const buffer = createRingBuffer<number>(3);
        [1, 2, 3, 4, 5].forEach(n => buffer.push(n));

        expect(buffer.size()).toBe(3);
        expect(buffer.peek()).toEqual([3, 4, 5]);
    });

    it('shift는 오래된 순으로 꺼내며 버퍼에서 제거한다', () => {
        const buffer = createRingBuffer<number>(5);
        [1, 2, 3].forEach(n => buffer.push(n));

        expect(buffer.shift(2)).toEqual([1, 2]);
        expect(buffer.size()).toBe(1);
        expect(buffer.peek()).toEqual([3]);
    });

    it('덮어쓰기로 head가 회전한 뒤에도 FIFO 순서를 유지한다', () => {
        const buffer = createRingBuffer<number>(3);
        [1, 2, 3, 4].forEach(n => buffer.push(n)); // head has wrapped past index 0

        expect(buffer.shift()).toEqual([2, 3, 4]);
        expect(buffer.size()).toBe(0);

        // Buffer stays usable after being drained.
        buffer.push(9);
        expect(buffer.peek()).toEqual([9]);
    });

    it('count가 크기를 초과하거나 음수여도 안전하게 동작한다', () => {
        const buffer = createRingBuffer<number>(3);
        buffer.push(1);

        expect(buffer.peek(10)).toEqual([1]);
        expect(buffer.peek(-1)).toEqual([]);
        expect(buffer.shift(10)).toEqual([1]);
        expect(buffer.shift(10)).toEqual([]);
    });

    it('clear는 버퍼를 완전히 비운다', () => {
        const buffer = createRingBuffer<number>(3);
        [1, 2].forEach(n => buffer.push(n));
        buffer.clear();

        expect(buffer.size()).toBe(0);
        expect(buffer.peek()).toEqual([]);
    });
});
