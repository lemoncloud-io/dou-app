/**
 * `metrics/e2e-collector.ts`
 * - React 밖 plain collector. 클라 1개당 1개 보유.
 * - 송신 E2E(헤드라인): 송신자는 자기 chat.sync broadcast에서 제외되므로 onApply가 안 fire.
 *   → t0=send, t1=chat.send 응답 resolve, t2=응답 렌더 후 rAF.
 * - 수신 E2E(보너스, 멀티패널): 임베드 sentAt=t0, onApply=t1, t2=rAF. 공유 시계 전제.
 * - 고빈도 샘플이 React 리렌더 폭주를 일으키지 않도록 통지는 rAF 1회 배치.
 */
/** 정렬 후 ratio 분위수(올림). 빈 배열은 0. */
const percentile = (values: number[], ratio: number): number => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.max(0, Math.ceil(ratio * sorted.length) - 1);
    return Math.round(sorted[Math.min(index, sorted.length - 1)]);
};

export interface E2ESample {
    t0: number;
    t1: number;
    t2: number;
    serverMs: number; // t1 - t0
    renderMs: number; // t2 - t1
    e2eMs: number; // t2 - t0
}

export interface MetricsSummary {
    sendE2eP50: number;
    sendE2eP95: number;
    recvE2eP50: number;
    recvE2eP95: number;
    rttP50: number;
    rttP95: number;
    gapCount: number;
    catchUpCount: number;
    reconnectRecoveryMs?: number;
    sendSamples: number;
    recvSamples: number;
    rttSamples: number;
}

export interface E2ECollectorOptions {
    /** 테스트 주입용. 기본 performance.now */
    now?: () => number;
    /** 테스트 주입용. 기본 requestAnimationFrame */
    scheduleFrame?: (cb: () => void) => void;
}

const defaultNow = (): number =>
    typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
const defaultFrame = (cb: () => void): void => {
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => cb());
    else setTimeout(cb, 16);
};

export class E2ECollector {
    private readonly now: () => number;
    private readonly scheduleFrame: (cb: () => void) => void;
    private seq = 0;
    private readonly pendingSend = new Map<number, number>(); // token -> t0
    private readonly sendSamples: E2ESample[] = [];
    private readonly recvSamples: E2ESample[] = [];
    private readonly rtts: number[] = [];
    private gap = 0;
    private catchUp = 0;
    private recoveryMs?: number;
    private readonly listeners = new Set<() => void>();
    private notifyScheduled = false;

    constructor(opts: E2ECollectorOptions = {}) {
        this.now = opts.now ?? defaultNow;
        this.scheduleFrame = opts.scheduleFrame ?? defaultFrame;
    }

    /** chat.send 직전. t0 기록 + 상관 토큰 반환 */
    markSend(): number {
        const token = (this.seq += 1);
        this.pendingSend.set(token, this.now());
        return token;
    }

    /** chat.send 응답 resolve 시점 = t1. 렌더 후 rAF로 t2 확정 */
    markSendAck(token: number): void {
        const t0 = this.pendingSend.get(token);
        if (t0 === undefined) return;
        this.pendingSend.delete(token);
        const t1 = this.now();
        this.scheduleFrame(() => {
            const t2 = this.now();
            this.sendSamples.push({ t0, t1, t2, serverMs: t1 - t0, renderMs: t2 - t1, e2eMs: t2 - t0 });
            this.scheduleNotify();
        });
    }

    /** 수신 E2E(보너스): 다른 클라가 보낸 메시지 onApply에서 호출. originOk=같은 시계(timeOrigin) 검증 결과 */
    markReceive(sentAt: number, originOk: boolean): void {
        if (!originOk || !Number.isFinite(sentAt)) return;
        const t1 = this.now();
        this.scheduleFrame(() => {
            const t2 = this.now();
            this.recvSamples.push({ t0: sentAt, t1, t2, serverMs: t1 - sentAt, renderMs: t2 - t1, e2eMs: t2 - sentAt });
            this.scheduleNotify();
        });
    }

    markRtt(ms: number): void {
        if (Number.isFinite(ms) && ms >= 0) {
            this.rtts.push(ms);
            this.scheduleNotify();
        }
    }

    incGap(): void {
        this.gap += 1;
        this.scheduleNotify();
    }

    incCatchUp(): void {
        this.catchUp += 1;
        this.scheduleNotify();
    }

    markReconnectRecovered(ms: number): void {
        this.recoveryMs = ms;
        this.scheduleNotify();
    }

    subscribe(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    /** rAF 1회 배치 통지 — 같은 프레임 내 다중 샘플은 setState 1회로 합쳐진다 */
    private scheduleNotify(): void {
        if (this.notifyScheduled) return;
        this.notifyScheduled = true;
        this.scheduleFrame(() => {
            this.notifyScheduled = false;
            this.listeners.forEach(fn => fn());
        });
    }

    summary(): MetricsSummary {
        const sendE2e = this.sendSamples.map(s => s.e2eMs);
        const recvE2e = this.recvSamples.map(s => s.e2eMs);
        return {
            sendE2eP50: percentile(sendE2e, 0.5),
            sendE2eP95: percentile(sendE2e, 0.95),
            recvE2eP50: percentile(recvE2e, 0.5),
            recvE2eP95: percentile(recvE2e, 0.95),
            rttP50: percentile(this.rtts, 0.5),
            rttP95: percentile(this.rtts, 0.95),
            gapCount: this.gap,
            catchUpCount: this.catchUp,
            reconnectRecoveryMs: this.recoveryMs,
            sendSamples: this.sendSamples.length,
            recvSamples: this.recvSamples.length,
            rttSamples: this.rtts.length,
        };
    }
}
