import type { DomainChat } from '@chatic/data';

import { MetricsCollector } from './MetricsCollector';

const chat = (chatNo: number, createdAtMs: number): DomainChat => ({ chatNo, createdAtMs }) as DomainChat;

describe('MetricsCollector', () => {
    it('첫 관측 시 기존 메시지는 history로 보고 카운트하지 않는다', () => {
        const m = new MetricsCollector(() => 1_000);
        m.reportChat('ch-1', [chat(1, 0), chat(2, 0), chat(3, 0)]);

        expect(m.getSnapshot().chatMessagesTotal).toBe(0);
        // first sight still counts as one cache observation
        expect(m.getSnapshot().cacheObservations.chat).toBe(1);
    });

    it('baseline 이후 새 메시지만 카운트하고 지연시간을 계산한다', () => {
        let now = 1_000;
        const m = new MetricsCollector(() => now);
        m.reportChat('ch-1', [chat(1, 0)]); // baseline

        now = 5_000;
        m.reportChat('ch-1', [chat(1, 0), chat(2, 4_800), chat(3, 4_900)]);

        const snap = m.getSnapshot();
        expect(snap.chatMessagesTotal).toBe(2);
        expect(snap.lastChatLatencyMs).toBe(100); // 5000 - 4900
        expect(snap.avgChatLatencyMs).toBe(150); // (200 + 100) / 2
    });

    it('윈도우(10s)가 지나면 처리량을 0으로 굴려낸다', () => {
        let now = 0;
        const m = new MetricsCollector(() => now);
        m.reportChat('ch-1', [chat(0, 0)]); // baseline

        now = 1_000;
        m.reportChat('ch-1', [chat(1, 1_000)]);
        expect(m.getSnapshot().chatMessagesPerSec).toBeCloseTo(0.1, 5); // 1 / 10s

        now = 20_000; // past the 10s window
        m.reportObservation('chat'); // triggers recompute
        expect(m.getSnapshot().chatMessagesPerSec).toBe(0);
        expect(m.getSnapshot().chatMessagesTotal).toBe(1); // total is cumulative
    });

    it('관측·렌더 횟수를 키별로 카운트한다', () => {
        const m = new MetricsCollector(() => 0);
        m.reportObservation('place');
        m.reportObservation('place');
        m.reportObservation('channel');
        m.reportRender('ChatHome');
        m.reportRender('ChatHome');

        expect(m.getSnapshot().cacheObservations).toEqual({ place: 2, channel: 1 });
        expect(m.getSnapshot().renders.ChatHome).toBe(2);
    });

    it('소켓 connect/disconnect 전이를 카운트한다', () => {
        let now = 100;
        const m = new MetricsCollector(() => now);
        m.reportSocketState('connecting');
        m.reportSocketState('connected');
        now = 500;
        m.reportSocketState('closed');
        m.reportSocketState('connected');

        const snap = m.getSnapshot();
        expect(snap.socketConnects).toBe(2);
        expect(snap.socketDisconnects).toBe(1);
        expect(snap.socketState).toBe('connected');
    });

    it('변경 시 구독자에게 알리고 구독 해제 후엔 알리지 않는다', () => {
        const m = new MetricsCollector(() => 0);
        let calls = 0;
        const unsub = m.subscribe(() => {
            calls += 1;
        });
        m.reportRender('X');
        expect(calls).toBe(1);
        unsub();
        m.reportRender('X');
        expect(calls).toBe(1);
    });
});
