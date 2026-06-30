/**
 * `hooks/use-canary-sim.ts`
 * - Probe/Canary 라이브 시뮬레이션. 디자인 probeStep/seed 포팅(1s clock, 2s마다 probe 샘플).
 * - 명시적 start/stop — 탭 진입만으로 연결하지 않음. start()로 pub/sub 2개 연결·송신 시작.
 * - Phase 2: start/stop을 실 WS pub/sub(CanaryRunner) 연결/해제로 교체(반환 형태 유지).
 */
import { useEffect, useRef, useState } from 'react';

import type { MetricKey } from '../lib/stats';
import type { CanaryEvent, ConnStatus, MetricsMap } from '../model/monitor-types';

const wall = (t0: number, off: number): string => new Date(t0 + off * 1000).toTimeString().slice(0, 8);

const seriesGen = (base: number, jit: number, n = 30): number[] =>
    Array.from({ length: n }, () => base + (Math.random() - 0.5) * jit);

const emptyMetrics = (): MetricsMap => ({
    fanout: { series: [], unit: 'ms' },
    rtt: { series: [], unit: 'ms' },
    send: { series: [], unit: 'ms' },
    handshake: { series: [], unit: 'ms' },
    loss: { series: [], unit: '%' },
    catchup: { series: [], unit: 'ms' },
    reconnect: { series: [], unit: 'ms' },
});

const seedMetrics = (): MetricsMap => ({
    fanout: { series: seriesGen(42, 18), unit: 'ms' },
    rtt: { series: seriesGen(68, 22), unit: 'ms' },
    send: { series: seriesGen(35, 12), unit: 'ms' },
    handshake: { series: seriesGen(180, 40), unit: 'ms' },
    loss: { series: seriesGen(0.2, 0.4).map(v => Math.max(0, v)), unit: '%' },
    catchup: { series: seriesGen(140, 60), unit: 'ms' },
    reconnect: { series: seriesGen(820, 260), unit: 'ms' },
});

const seedEvents = (t0: number): CanaryEvent[] => {
    const ev: CanaryEvent[] = [];
    const seq0 = 240;
    for (let i = 0; i < 12; i++) {
        const dir = i % 2 === 0 ? 'sub' : 'pub';
        ev.push({
            id: 's' + i,
            t: wall(t0, -i),
            dir,
            type: 'chat.sync',
            seq: seq0 - i,
            latency: dir === 'sub' ? Math.round(38 + Math.random() * 20) : null,
            level: 'info',
        });
    }
    return ev;
};

export interface CanarySim {
    running: boolean;
    clock: number;
    metrics: MetricsMap;
    events: CanaryEvent[];
    pubStatus: ConnStatus;
    subStatus: ConnStatus;
    gapDrop: boolean;
    paused: boolean;
    start(): void;
    stop(): void;
    toggleGapDrop(): void;
    togglePause(): void;
}

export const useCanarySim = (liveMotion: boolean): CanarySim => {
    const [running, setRunning] = useState(false);
    const [clock, setClock] = useState(0);
    const [metrics, setMetrics] = useState<MetricsMap>(emptyMetrics);
    const [events, setEvents] = useState<CanaryEvent[]>([]);
    const [pubStatus, setPubStatus] = useState<ConnStatus>('idle');
    const [subStatus, setSubStatus] = useState<ConnStatus>('idle');
    const [gapDrop, setGapDrop] = useState(false);
    const [paused, setPaused] = useState(false);

    const t0Ref = useRef(0);
    const clockRef = useRef(0);
    const metricsRef = useRef<MetricsMap>(metrics);
    const gapDropRef = useRef(gapDrop);
    const pausedRef = useRef(paused);
    const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
    const pubToRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const subToRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    gapDropRef.current = gapDrop;
    pausedRef.current = paused;

    const clearTimers = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (pubToRef.current) clearTimeout(pubToRef.current);
        if (subToRef.current) clearTimeout(subToRef.current);
    };

    useEffect(() => clearTimers, []);

    const probeStep = (clk: number) => {
        const gd = gapDropRef.current;
        const m = metricsRef.current;
        const nm: MetricsMap = { ...m };
        const push = (k: MetricKey, v: number) => {
            const a = [...nm[k].series, v];
            if (a.length > 40) a.shift();
            nm[k] = { ...nm[k], series: a };
        };
        push('fanout', 42 + (Math.random() - 0.5) * 18 + (gd ? Math.random() * 46 : 0));
        push('rtt', 68 + (Math.random() - 0.5) * 22);
        push('send', 35 + (Math.random() - 0.5) * 12);
        push('handshake', 180 + (Math.random() - 0.5) * 40);
        push('loss', Math.max(0, (gd ? 2.6 : 0.2) + (Math.random() - 0.5) * (gd ? 2.2 : 0.4)));
        push('catchup', (gd ? 430 : 140) + (Math.random() - 0.5) * (gd ? 200 : 60));
        push('reconnect', 820 + (Math.random() - 0.5) * 260);
        metricsRef.current = nm;
        setMetrics(nm);

        if (pausedRef.current) return;
        const seq = 240 + Math.floor(clk / 2);
        const t = wall(t0Ref.current, clk);
        const lat = nm.fanout.series[nm.fanout.series.length - 1];
        setEvents(prev => {
            const ev = [...prev];
            const add = (e: CanaryEvent) => ev.unshift(e);
            add({
                id: 'e' + clk + 'b',
                t,
                dir: 'sub',
                type: 'chat.sync',
                seq,
                latency: Math.round(lat),
                level: 'info',
            });
            add({ id: 'e' + clk + 'a', t, dir: 'pub', type: 'chat.sync', seq, latency: null, level: 'info' });
            if (gd && Math.random() < 0.5) {
                add({
                    id: 'e' + clk + 'c',
                    t,
                    dir: 'sub',
                    type: 'catch-up.done',
                    seq,
                    latency: Math.round(nm.catchup.series[nm.catchup.series.length - 1]),
                    level: 'warn',
                });
                add({
                    id: 'e' + clk + 'g',
                    t,
                    dir: 'sub',
                    type: 'gap-detected',
                    seq,
                    latency: null,
                    level: 'warn',
                    label: 'seq gap → catch-up',
                });
            }
            if (Math.random() < 0.04) {
                add({
                    id: 'e' + clk + 'r',
                    t,
                    dir: 'pub',
                    type: 'reconnect',
                    seq,
                    latency: Math.round(nm.reconnect.series[nm.reconnect.series.length - 1]),
                    level: 'error',
                    label: 'socket dropped → reconnected',
                });
            }
            if (ev.length > 60) ev.length = 60;
            return ev;
        });
    };

    const start = () => {
        if (running) return;
        clearTimers();
        const t0 = Date.now();
        t0Ref.current = t0;
        clockRef.current = 0;
        const seeded = seedMetrics();
        metricsRef.current = seeded;
        setMetrics(seeded);
        setEvents(seedEvents(t0));
        setClock(0);
        setRunning(true);
        setPaused(false);
        setPubStatus('connecting');
        setSubStatus('connecting');
        pubToRef.current = setTimeout(() => setPubStatus('connected'), 1300);
        subToRef.current = setTimeout(() => setSubStatus('connected'), 2000);
        if (liveMotion !== false) {
            timerRef.current = setInterval(() => {
                // 업데이터 안에서 부작용 금지(StrictMode 이중 실행→중복). 콜백에서 직접 진행.
                const clk = clockRef.current + 1;
                clockRef.current = clk;
                setClock(clk);
                if (clk % 2 === 0) probeStep(clk);
            }, 1000);
        }
    };

    const stop = () => {
        clearTimers();
        setRunning(false);
        setPubStatus('idle');
        setSubStatus('idle');
    };

    return {
        running,
        clock,
        metrics,
        events,
        pubStatus,
        subStatus,
        gapDrop,
        paused,
        start,
        stop,
        toggleGapDrop: () => setGapDrop(v => !v),
        togglePause: () => setPaused(v => !v),
    };
};
