import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/data';
import { MetricsCollector } from './MetricsCollector';

const chat = (chatNo: number, createdAtMs: number): DomainChat => ({ chatNo, createdAtMs }) as DomainChat;

describe('MetricsCollector', () => {
    it('seeds the baseline on first sight without counting history', () => {
        const m = new MetricsCollector(() => 1_000);
        m.reportChat('ch-1', [chat(1, 0), chat(2, 0), chat(3, 0)]);

        expect(m.getSnapshot().chatMessagesTotal).toBe(0);
        // first sight still counts as one cache observation
        expect(m.getSnapshot().cacheObservations.chat).toBe(1);
    });

    it('counts only messages newer than the baseline and computes latency', () => {
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

    it('rolls throughput off after the window', () => {
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

    it('counts observations and renders per key', () => {
        const m = new MetricsCollector(() => 0);
        m.reportObservation('place');
        m.reportObservation('place');
        m.reportObservation('channel');
        m.reportRender('ChatHome');
        m.reportRender('ChatHome');

        expect(m.getSnapshot().cacheObservations).toEqual({ place: 2, channel: 1 });
        expect(m.getSnapshot().renders.ChatHome).toBe(2);
    });

    it('counts socket connect/disconnect transitions', () => {
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

    it('notifies subscribers on change', () => {
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
