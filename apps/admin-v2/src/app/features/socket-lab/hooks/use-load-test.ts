/**
 * `hooks/use-load-test.ts`
 * - Probe/Load test 시뮬레이션. 디자인 tickLoad/computeReport/applyPreset 포팅(500ms 틱).
 * - Phase 2: tickLoad의 latency 수식과 computeReport 집계를 실 N-client 측정으로 교체.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Cell, CurvePoint, LoadConfig, LoadReport, RunState, SavedRun, Verdict } from '../model/monitor-types';

type LoadState = 'idle' | 'running' | 'done';

const DEFAULT_CONFIG: LoadConfig = {
    subs: 20,
    pubs: 1,
    rate: 5,
    payload: 256,
    ramp: 'staged',
    duration: 30,
    gapDrop: false,
};
const EMPTY_RUN: RunState = { elapsed: 0, conns: 0, sent: 0, recv: 0, ramp: [], live: [] };

const PRESETS: Record<string, Partial<LoadConfig>> = {
    fanout: { subs: 50, pubs: 1, rate: 2, payload: 256, ramp: 'staged', duration: 40 },
    throughput: { subs: 20, pubs: 2, rate: 20, payload: 256, ramp: 'instant', duration: 30 },
    spike: { subs: 40, pubs: 1, rate: 5, payload: 256, ramp: 'instant', duration: 20 },
    soak: { subs: 15, pubs: 1, rate: 2, payload: 512, ramp: 'staged', duration: 90 },
};

const pctOf = (arr: number[], p: number): number => {
    if (!arr.length) return 0;
    const a = [...arr].sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
};

const computeReport = (cfg: LoadConfig, run: RunState, aborted: boolean): LoadReport => {
    const N = Math.max(1, run.conns || cfg.subs);
    const slo = 100;
    const payF = cfg.payload / 256;
    const kneeN = Math.max(8, Math.round(36 - (payF - 1) * 8 - (cfg.rate - 5) * 0.7));
    const curve: CurvePoint[] = [];
    for (let n = 1; n <= N; n++) {
        const base = 36 + payF * 4;
        let p50 = base + n * 0.6;
        let p95 = base * 1.35 + n * 1.05;
        if (n > kneeN) {
            const d = n - kneeN;
            p95 += d * d * 0.85;
            p50 += d * 1.8;
        }
        curve.push({
            n,
            p50: Math.max(1, Math.round(p50 + (Math.random() * 4 - 2))),
            p95: Math.max(1, Math.round(p95 + (Math.random() * 6 - 3))),
        });
    }
    const fanoutP95 = curve[curve.length - 1].p95;
    const fanoutP50 = curve[curve.length - 1].p50;
    const hist: number[] = [];
    for (let i = 0; i < 480; i++) {
        const u = Math.random();
        let v = fanoutP50 + -Math.log(1 - u) * (fanoutP50 * 0.5);
        if (Math.random() < 0.05) v *= 1.7;
        hist.push(v);
    }
    hist.sort((a, b) => a - b);
    const hp = (q: number) => Math.round(hist[Math.min(hist.length - 1, Math.floor((q / 100) * hist.length))]);
    const maxLat = Math.round(hist[hist.length - 1]);
    const perSub: number[] = [];
    for (let i = 0; i < N; i++) {
        let v = fanoutP95 * (0.78 + Math.random() * 0.4);
        if (Math.random() < 0.08) v *= 1.4 + Math.random() * 0.6;
        perSub.push(v);
    }
    const sorted = [...perSub].sort((a, b) => a - b);
    const median = sorted[Math.floor(N / 2)] || 1;
    const worst = Math.max(...perSub);
    const worstI = perSub.indexOf(worst);
    const cellColor = (v: number) => {
        const r = v / slo;
        return r < 0.7 ? '#3fb950' : r < 1 ? '#d29922' : '#f85149';
    };
    const perSubCells: Cell[] = perSub.map((v, i) => ({
        i,
        color: cellColor(v),
        title: `sub ${i + 1}: ${Math.round(v)}ms`,
        isWorst: i === worstI,
    }));
    const sat = N > kneeN || cfg.rate >= 15 || cfg.gapDrop;
    const completeness: number[] = [];
    for (let i = 0; i < N; i++) {
        let pc = 100;
        if (cfg.gapDrop) pc -= Math.random() * 4;
        if (sat && Math.random() < 0.3) pc -= Math.random() * 5;
        completeness.push(Math.max(90, pc));
    }
    const compColor = (pc: number) => (pc >= 99.5 ? '#3fb950' : pc >= 98 ? '#d29922' : '#f85149');
    const completenessCells: Cell[] = completeness.map((pc, i) => ({
        i,
        color: compColor(pc),
        title: `sub ${i + 1}: ${pc.toFixed(1)}%`,
    }));
    const avgComp = completeness.reduce((a, b) => a + b, 0) / N;
    const lossPct = 100 - avgComp;
    const dpsSeries = (run.ramp.length ? run.ramp : [N]).map(c => cfg.pubs * cfg.rate * c);
    const throughputTarget = cfg.pubs * cfg.rate * N;
    const throughputAchieved = Math.round(throughputTarget * (sat ? 0.82 : 0.98));
    const connect: number[] = [];
    for (let i = 0; i < N; i++) {
        let v = 150 + Math.random() * 120;
        if (N > kneeN && Math.random() < 0.2) v += Math.random() * 200;
        connect.push(v);
    }
    connect.sort((a, b) => a - b);
    const cp = (q: number) => Math.round(connect[Math.min(connect.length - 1, Math.floor((q / 100) * connect.length))]);
    const connFail = Math.max(0, N - 44) + (cfg.gapDrop ? 1 : 0);
    const verdict: Verdict = fanoutP95 < slo && connFail === 0 ? 'PASS' : fanoutP95 < slo * 1.5 ? 'WARN' : 'FAIL';
    return {
        aborted,
        slo,
        peakN: N,
        curve,
        kneeN: kneeN <= N ? kneeN : null,
        fanoutP95,
        fanoutP50,
        histSamples: hist,
        p50: hp(50),
        p95: hp(95),
        p99: hp(99),
        maxLat,
        perSubCells,
        median: Math.round(median),
        worst: Math.round(worst),
        fairness: (worst / median).toFixed(1),
        completenessCells,
        lossPct,
        avgComp,
        dpsSeries,
        throughputTarget,
        throughputAchieved,
        connectSamples: connect,
        connP50: cp(50),
        connP95: cp(95),
        connFail,
        verdict,
        time: new Date().toTimeString().slice(0, 5),
        cfg: { ...cfg },
        label: `N=${N} · ${cfg.rate}msg/s · ${cfg.duration}s`,
    };
};

export interface LoadTest {
    loadState: LoadState;
    config: LoadConfig;
    run: RunState;
    report: LoadReport | null;
    savedRuns: SavedRun[];
    compareId: string | null;
    pct: (arr: number[], p: number) => number;
    setConfig: (patch: Partial<LoadConfig>) => void;
    applyPreset: (name: string) => void;
    runLoad: () => void;
    abortLoad: () => void;
    resetLoad: () => void;
    saveRun: () => void;
    toggleCompare: (id: string) => void;
}

export const useLoadTest = (): LoadTest => {
    const [loadState, setLoadState] = useState<LoadState>('idle');
    const [config, setConfigState] = useState<LoadConfig>(DEFAULT_CONFIG);
    const [run, setRun] = useState<RunState>(EMPTY_RUN);
    const [report, setReport] = useState<LoadReport | null>(null);
    const [savedRuns, setSavedRuns] = useState<SavedRun[]>([]);
    const [compareId, setCompareId] = useState<string | null>(null);

    const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
    const configRef = useRef(config);
    const runRef = useRef(run);
    configRef.current = config;

    useEffect(() => () => clearInterval(timerRef.current), []);

    const setConfig = useCallback((patch: Partial<LoadConfig>) => setConfigState(c => ({ ...c, ...patch })), []);
    const applyPreset = useCallback((name: string) => {
        const p = PRESETS[name];
        if (p) setConfigState(c => ({ ...c, ...p }));
    }, []);

    const tickLoad = useCallback(() => {
        const cfg = configRef.current;
        const prev = runRef.current;
        const r: RunState = { ...prev, ramp: [...prev.ramp], live: [...prev.live] };
        r.elapsed += 1;
        if (cfg.ramp === 'instant') r.conns = cfg.subs;
        else
            {r.conns = Math.min(
                cfg.subs,
                Math.round(cfg.subs * Math.min(1, r.elapsed / Math.max(1, cfg.duration * 0.6)))
            );}
        r.ramp.push(r.conns);
        r.sent += cfg.pubs * cfg.rate;
        r.recv += cfg.pubs * cfg.rate * r.conns;
        const base = 36 + (cfg.payload / 256) * 4;
        let lat = base * 1.35 + r.conns * 1.05;
        if (r.conns > 34) lat += (r.conns - 34) * (r.conns - 34) * 0.85;
        r.live.push(Math.round(lat + (Math.random() * 8 - 4)));
        if (r.live.length > 80) r.live.shift();
        runRef.current = r;
        if (r.elapsed >= cfg.duration) {
            clearInterval(timerRef.current);
            setRun(r);
            setReport(computeReport(cfg, r, false));
            setLoadState('done');
            return;
        }
        setRun(r);
    }, []);

    const runLoad = useCallback(() => {
        clearInterval(timerRef.current);
        runRef.current = { ...EMPTY_RUN, ramp: [], live: [] };
        setRun(runRef.current);
        setReport(null);
        setCompareId(null);
        setLoadState('running');
        timerRef.current = setInterval(tickLoad, 500);
    }, [tickLoad]);

    const abortLoad = useCallback(() => {
        clearInterval(timerRef.current);
        setReport(computeReport(configRef.current, runRef.current, true));
        setLoadState('done');
    }, []);

    const resetLoad = useCallback(() => {
        clearInterval(timerRef.current);
        setReport(null);
        setCompareId(null);
        setLoadState('idle');
    }, []);

    const saveRun = useCallback(() => {
        setReport(r => {
            if (r) {
                const e: SavedRun = {
                    id: 'run' + Date.now(),
                    label: r.label,
                    time: r.time,
                    peakN: r.peakN,
                    p95: r.fanoutP95,
                    verdict: r.verdict,
                    curve: r.curve,
                };
                setSavedRuns(prev => [e, ...prev].slice(0, 6));
            }
            return r;
        });
    }, []);

    const toggleCompare = useCallback((id: string) => setCompareId(c => (c === id ? null : id)), []);

    return {
        loadState,
        config,
        run,
        report,
        savedRuns,
        compareId,
        pct: pctOf,
        setConfig,
        applyPreset,
        runLoad,
        abortLoad,
        resetLoad,
        saveRun,
        toggleCompare,
    };
};
