import { createRingBuffer } from './ringBuffer';

describe('ringBuffer', () => {
    it('push 후 peek은 FIFO 순서로 조회되어야 한다', () => {
        const q = createRingBuffer<number>(2);

        q.push(1);
        q.push(2);
        q.push(3);

        expect(q.size()).toBe(3);
        expect(q.peek()).toEqual([1, 2, 3]);
    });

    it('shift는 앞에서부터 제거되어야 한다', () => {
        const q = createRingBuffer<number>(2);
        q.push(10);
        q.push(20);
        q.push(30);

        const firstTwo = q.shift(2);

        expect(firstTwo).toEqual([10, 20]);
        expect(q.size()).toBe(1);
        expect(q.peek()).toEqual([30]);
    });

    it('load는 전달된 배열로 큐를 재구성해야 한다', () => {
        const q = createRingBuffer<string>(2);
        q.push('a');
        q.push('b');

        q.load(['x', 'y', 'z']);

        expect(q.size()).toBe(3);
        expect(q.toArray()).toEqual(['x', 'y', 'z']);
    });

    it('clear는 큐를 완전히 비워야 한다', () => {
        const q = createRingBuffer<number>(4);
        q.push(1);
        q.push(2);

        q.clear();

        expect(q.size()).toBe(0);
        expect(q.peek()).toEqual([]);
    });
});
