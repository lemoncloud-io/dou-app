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
        expect(t.tryAcquire()).toBe(false); // 30s 지났지만 이제 60s 홀드다
        now = 90_000;
        expect(t.tryAcquire()).toBe(true); // hold 120s

        // 상한까지 밀어 올린다
        now = 210_000;
        expect(t.tryAcquire()).toBe(true); // hold 240s
        now = 450_000;
        expect(t.tryAcquire()).toBe(true); // hold 300s (상한)
        now = 750_000;
        expect(t.tryAcquire()).toBe(true);
        now = 1_050_000;
        expect(t.tryAcquire()).toBe(true); // 300s 를 넘지 않는다
    });

    it('reset 은 홀드를 풀고 첫 간격을 복구한다 — 성공 뒤 예산 복구', () => {
        let now = 0;
        const t = new Throttle({ intervalMs: 30_000, maxIntervalMs: 300_000, now: () => now });
        t.tryAcquire();
        now = 30_000;
        t.tryAcquire(); // interval 이 60s 로 자랐다

        t.reset();
        expect(t.tryAcquire()).toBe(true); // 홀드 해제
        now = 60_000;
        expect(t.tryAcquire()).toBe(true); // 간격이 30s 로 돌아왔다
    });
});
