import { PERF_SAMPLE_PERCENT, hashRunId, isSampledRun } from './sampling';

describe('hashRunId', () => {
    it('같은 입력에 같은 값을 낸다 — 두 런타임이 조율 없이 일치하는 근거다', () => {
        expect(hashRunId('run-abc')).toBe(hashRunId('run-abc'));
    });

    it('다른 입력은 다른 값으로 흩어진다', () => {
        expect(hashRunId('run-abc')).not.toBe(hashRunId('run-abd'));
    });

    it('부호 없는 32비트 범위를 벗어나지 않는다', () => {
        for (const runId of ['', 'a', 'run-0123456789abcdef', '한글도-섞인-id']) {
            const hash = hashRunId(runId);

            expect(Number.isInteger(hash)).toBe(true);
            expect(hash).toBeGreaterThanOrEqual(0);
            expect(hash).toBeLessThanOrEqual(0xffffffff);
        }
    });
});

describe('isSampledRun', () => {
    it('runId가 없으면 뽑지 않는다 — 세션에 묶이지 않는 지표는 쓸모가 없다', () => {
        expect(isSampledRun(undefined)).toBe(false);
        expect(isSampledRun('')).toBe(false);
    });

    it('0%는 전부 탈락, 100%는 전부 통과', () => {
        expect(isSampledRun('run-abc', 0)).toBe(false);
        expect(isSampledRun('run-abc', 100)).toBe(true);
    });

    it('같은 runId면 몇 번을 물어도 같은 답이다', () => {
        const answers = Array.from({ length: 5 }, () => isSampledRun('run-abc', PERF_SAMPLE_PERCENT));

        expect(new Set(answers).size).toBe(1);
    });

    it('비율이 커질수록 통과 집합이 줄지 않는다 (단조)', () => {
        const runIds = Array.from({ length: 500 }, (_, i) => `run-${i}`);
        const sampledAt = (percent: number) => new Set(runIds.filter(runId => isSampledRun(runId, percent)));

        const ten = sampledAt(10);
        const fifty = sampledAt(50);

        for (const runId of ten) expect(fifty.has(runId)).toBe(true);
    });

    it('대량 표본에서 지정 비율 근처로 뽑힌다', () => {
        const runIds = Array.from({ length: 10_000 }, (_, i) => `run-${i}-${i * 7919}`);
        const sampled = runIds.filter(runId => isSampledRun(runId, 10)).length;

        // A hash, not a generator: the tolerance is wide enough that this asserts
        // "roughly a tenth" rather than pinning FNV's exact distribution.
        expect(sampled / runIds.length).toBeGreaterThan(0.07);
        expect(sampled / runIds.length).toBeLessThan(0.13);
    });
});
