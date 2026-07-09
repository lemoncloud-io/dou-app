import type { DomainChat } from '@chatic/data';

/**
 * Web-side runtime metrics. All aggregation happens here — components only push
 * raw state via `report*` callbacks. The engine (libs/app-runtime) stays unaware
 * of metrics; cache activity is observed in-memory from `observe` notifications.
 */
export interface MetricsSnapshot {
    // throughput / latency — live chat deltas only (initial history is excluded)
    chatMessagesTotal: number;
    chatMessagesPerSec: number;
    lastChatLatencyMs: number | null;
    avgChatLatencyMs: number | null;
    // cache: count of observe notifications per domain (proxy for cache changes)
    cacheObservations: Record<string, number>;
    // render counts per labelled component
    renders: Record<string, number>;
    // socket connection quality
    socketState: string;
    socketConnects: number;
    socketDisconnects: number;
    socketStateSinceMs: number | null;
}

const ROLLING_WINDOW_MS = 10_000;
const MAX_LATENCY_SAMPLES = 50;

const emptySnapshot = (): MetricsSnapshot => ({
    chatMessagesTotal: 0,
    chatMessagesPerSec: 0,
    lastChatLatencyMs: null,
    avgChatLatencyMs: null,
    cacheObservations: {},
    renders: {},
    socketState: '',
    socketConnects: 0,
    socketDisconnects: 0,
    socketStateSinceMs: null,
});

export class MetricsCollector {
    private snapshot: MetricsSnapshot = emptySnapshot();
    private readonly listeners = new Set<() => void>();
    private readonly now: () => number;

    // per-channel highest chatNo we have already counted — first sight seeds the
    // baseline (history) without counting it as live throughput.
    private readonly chatBaseline = new Map<string, number>();
    private readonly recentMessageTimes: number[] = [];
    private readonly latencySamples: number[] = [];

    constructor(now: () => number = () => Date.now()) {
        this.now = now;
    }

    public subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    public getSnapshot = (): MetricsSnapshot => this.snapshot;

    /** Report the current chat list for a channel (from an observe callback). */
    public reportChat = (channelId: string, list: DomainChat[]): void => {
        this.bumpObservation('chat');

        const maxNo = list.reduce((max, c) => (c.chatNo > max ? c.chatNo : max), 0);
        const baseline = this.chatBaseline.get(channelId);

        if (baseline === undefined) {
            // First sight: seed baseline, treat existing messages as history.
            this.chatBaseline.set(channelId, maxNo);
            this.commit();
            return;
        }
        if (maxNo <= baseline) {
            this.commit();
            return;
        }

        const fresh = list.filter(c => c.chatNo > baseline);
        this.chatBaseline.set(channelId, maxNo);

        const at = this.now();
        for (const msg of fresh) {
            this.recentMessageTimes.push(at);
            if (typeof msg.createdAtMs === 'number') {
                const latency = at - msg.createdAtMs;
                this.latencySamples.push(latency);
                if (this.latencySamples.length > MAX_LATENCY_SAMPLES) this.latencySamples.shift();
            }
        }
        this.snapshot = { ...this.snapshot, chatMessagesTotal: this.snapshot.chatMessagesTotal + fresh.length };
        this.commit();
    };

    /** Report that a domain's observe stream fired (cache change observed). */
    public reportObservation = (domain: string): void => {
        this.bumpObservation(domain);
        this.commit();
    };

    /** Report a component render. */
    public reportRender = (label: string): void => {
        this.snapshot = {
            ...this.snapshot,
            renders: { ...this.snapshot.renders, [label]: (this.snapshot.renders[label] ?? 0) + 1 },
        };
        this.emit();
    };

    /** Report the current socket state; transitions are counted here. */
    public reportSocketState = (state: string): void => {
        if (state === this.snapshot.socketState) return;

        const wasConnected = this.snapshot.socketState === 'connected';
        const isConnected = state === 'connected';
        this.snapshot = {
            ...this.snapshot,
            socketState: state,
            socketStateSinceMs: this.now(),
            socketConnects: this.snapshot.socketConnects + (!wasConnected && isConnected ? 1 : 0),
            socketDisconnects: this.snapshot.socketDisconnects + (wasConnected && !isConnected ? 1 : 0),
        };
        this.emit();
    };

    public reset = (): void => {
        this.snapshot = emptySnapshot();
        this.chatBaseline.clear();
        this.recentMessageTimes.length = 0;
        this.latencySamples.length = 0;
        this.emit();
    };

    private bumpObservation(domain: string): void {
        this.snapshot = {
            ...this.snapshot,
            cacheObservations: {
                ...this.snapshot.cacheObservations,
                [domain]: (this.snapshot.cacheObservations[domain] ?? 0) + 1,
            },
        };
    }

    private commit(): void {
        this.recomputeDerived();
        this.emit();
    }

    private recomputeDerived(): void {
        const cutoff = this.now() - ROLLING_WINDOW_MS;
        while (this.recentMessageTimes.length && this.recentMessageTimes[0] < cutoff) {
            this.recentMessageTimes.shift();
        }
        const perSec = this.recentMessageTimes.length / (ROLLING_WINDOW_MS / 1000);
        const last = this.latencySamples.length ? this.latencySamples[this.latencySamples.length - 1] : null;
        const avg = this.latencySamples.length
            ? Math.round(this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length)
            : null;
        this.snapshot = {
            ...this.snapshot,
            chatMessagesPerSec: Math.round(perSec * 100) / 100,
            lastChatLatencyMs: last,
            avgChatLatencyMs: avg,
        };
    }

    private emit(): void {
        for (const listener of this.listeners) listener();
    }
}

export const metricsCollector = new MetricsCollector();
