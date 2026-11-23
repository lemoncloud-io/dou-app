import { beforeEach, describe, expect, it } from 'vitest';
import { E2ECollector } from './e2e-collector';

describe('demo/E2ECollector', () => {
    let clock: number;
    let frames: Array<() => void>;
    let collector: E2ECollector;

    const now = () => clock;
    const scheduleFrame = (cb: () => void) => {
        frames.push(cb);
    };
    const drain = () => {
        let guard = 0;
        while (frames.length && guard++ < 100) {
            const batch = frames.splice(0);
            batch.forEach(fn => fn());
        }
    };

    beforeEach(() => {
        clock = 0;
        frames = [];
        collector = new E2ECollector({ now, scheduleFrame });
    });

    it('송신 E2E: t0=send, t1=ack, t2=rAF 로 serverMs/renderMs/e2eMs 계산', () => {
        clock = 0;
        const token = collector.markSend();
        clock = 10;
        collector.markSendAck(token);
        clock = 16;
        drain();
        const s = collector.summary();
        expect(s.sendSamples).toBe(1);
        expect(s.sendE2eP50).toBe(16);
    });

    it('알 수 없는 토큰 ack는 무시', () => {
        collector.markSendAck(999);
        drain();
        expect(collector.summary().sendSamples).toBe(0);
    });

    it('수신 E2E: originOk=false면 무시, true면 sentAt 기준 e2e 기록', () => {
        clock = 30;
        collector.markReceive(100, false);
        drain();
        expect(collector.summary().recvSamples).toBe(0);

        collector.markReceive(20, true);
        clock = 38;
        drain();
        const s = collector.summary();
        expect(s.recvSamples).toBe(1);
        expect(s.recvE2eP50).toBe(18);
    });

    it('rtt/gap/catchUp/복구 카운터 집계', () => {
        collector.markRtt(12);
        collector.markRtt(28);
        collector.incGap();
        collector.incCatchUp();
        collector.incCatchUp();
        collector.markReconnectRecovered(900);
        const s = collector.summary();
        expect(s.rttSamples).toBe(2);
        expect(s.rttP50).toBe(12);
        expect(s.gapCount).toBe(1);
        expect(s.catchUpCount).toBe(2);
        expect(s.reconnectRecoveryMs).toBe(900);
    });

    it('구독자는 rAF 배치 후 통지된다', () => {
        let calls = 0;
        collector.subscribe(() => {
            calls += 1;
        });
        collector.markRtt(5);
        collector.markRtt(7);
        expect(calls).toBe(0);
        drain();
        expect(calls).toBe(1);
    });
});
