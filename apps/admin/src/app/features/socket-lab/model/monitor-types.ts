/**
 * `model/monitor-types.ts`
 */
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
