/**
 * `model/monitor-types.ts` — Socket Monitor 공용 도메인 타입.
 */
import type { MetricKey } from '../lib/stats';

export interface MetricSeries {
    series: number[];
    unit: string;
}
export type MetricsMap = Record<MetricKey, MetricSeries>;

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface CanaryEvent {
    id: string;
    t: string; // HH:MM:SS
    dir: 'pub' | 'sub';
    type: string;
    seq: number;
    latency: number | null;
    level: 'info' | 'warn' | 'error';
    label?: string;
}

export type RampMode = 'instant' | 'staged';

export interface LoadConfig {
    subs: number;
    pubs: number;
    rate: number;
    payload: number;
    ramp: RampMode;
    duration: number;
    gapDrop: boolean;
}

export interface RunState {
    elapsed: number;
    conns: number;
    sent: number;
    recv: number;
    ramp: number[];
    live: number[];
}

export interface CurvePoint {
    n: number;
    p50: number;
    p95: number;
}

export type Verdict = 'PASS' | 'WARN' | 'FAIL';

export interface Cell {
    i: number;
    color: string;
    title: string;
    isWorst?: boolean;
}

export interface LoadReport {
    aborted: boolean;
    slo: number;
    peakN: number;
    curve: CurvePoint[];
    kneeN: number | null;
    fanoutP95: number;
    fanoutP50: number;
    histSamples: number[];
    p50: number;
    p95: number;
    p99: number;
    maxLat: number;
    perSubCells: Cell[];
    median: number;
    worst: number;
    fairness: string;
    completenessCells: Cell[];
    lossPct: number;
    avgComp: number;
    dpsSeries: number[];
    throughputTarget: number;
    throughputAchieved: number;
    connectSamples: number[];
    connP50: number;
    connP95: number;
    connFail: number;
    verdict: Verdict;
    time: string;
    cfg: LoadConfig;
    label: string;
}

export interface SavedRun {
    id: string;
    label: string;
    time: string;
    peakN: number;
    p95: number;
    verdict: Verdict;
    curve: CurvePoint[];
}
