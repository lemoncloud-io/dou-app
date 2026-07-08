import { addLongTask } from './longTasks';

describe('longTasks — 메인 스레드 블로킹 집계', () => {
    it('건수·누적·최대 시간을 집계한다', () => {
        let stats = { count: 0, totalMs: 0, maxMs: 0 };
        stats = addLongTask(stats, 80.6);
        stats = addLongTask(stats, 220.2);
        stats = addLongTask(stats, 51);
        expect(stats).toEqual({ count: 3, totalMs: 352, maxMs: 220 });
    });

    it('최대값은 이전 최대를 유지한다 (더 짧은 태스크가 갱신하지 않음)', () => {
        const stats = addLongTask({ count: 1, totalMs: 300, maxMs: 300 }, 60);
        expect(stats.maxMs).toBe(300);
    });
});
