import { Throttle } from './throttle';

describe('Throttle — 고정 간격', () => {
    it('첫 호출은 항상 통과하고 그 다음은 간격만큼 막는다', () => {
        let now = 0;
        const t = new Throttle({ intervalMs: 60_000, now: () => now });

        expect(t.tryAcquire()).toBe(true); // cold start must not wait
        expect(t.tryAcquire()).toBe(false);

        now = 59_999;
        expect(t.tryAcquire()).toBe(false);
        now = 60_000;
        expect(t.tryAcquire()).toBe(true);
    });

    it('간격이 자라지 않는다', () => {
        let now = 0;
        const t = new Throttle({ intervalMs: 1_000, now: () => now });
        t.tryAcquire();
        now = 1_000;
        expect(t.tryAcquire()).toBe(true);
        now = 2_000;
        expect(t.tryAcquire()).toBe(true);
    });
});

describe('Throttle — 지수 백오프', () => {
    it('허용할 때마다 간격이 두 배가 되고 상한에서 멈춘다', () => {
        let now = 0;
        const t = new Throttle({ intervalMs: 30_000, maxIntervalMs: 300_000, now: () => now });

        expect(t.tryAcquire()).toBe(true); // hold 30s
        now = 30_000;
        expect(t.tryAcquire()).toBe(true); // hold 60s
        now = 60_000;
        expect(t.tryAcquire()).toBe(false); // 30s has passed, but the hold is now 60s
        now = 90_000;
        expect(t.tryAcquire()).toBe(true); // hold 120s

        // push it up to the ceiling
        now = 210_000;
        expect(t.tryAcquire()).toBe(true); // hold 240s
        now = 450_000;
        expect(t.tryAcquire()).toBe(true); // hold 300s (ceiling)
        now = 750_000;
        expect(t.tryAcquire()).toBe(true);
        now = 1_050_000;
        expect(t.tryAcquire()).toBe(true); // doesn't exceed 300s
    });

    it('reset 은 홀드를 풀고 첫 간격을 복구한다 — 성공 뒤 예산 복구', () => {
        let now = 0;
        const t = new Throttle({ intervalMs: 30_000, maxIntervalMs: 300_000, now: () => now });
        t.tryAcquire();
        now = 30_000;
        t.tryAcquire(); // interval grew to 60s

        t.reset();
        expect(t.tryAcquire()).toBe(true); // hold released
        now = 60_000;
        expect(t.tryAcquire()).toBe(true); // interval back to 30s
    });
});
