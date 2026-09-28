import type { PerfTraceBackend } from '../PerfTrace';
import type { PerfTraceResult, PerfTraceStart } from '../types';

type Pending = { kind: 'start'; trace: PerfTraceStart } | { kind: 'stop'; result: PerfTraceResult };

/**
 * A backend that does not know yet where it forwards to.
 *
 * The WebView learns whether the installed app can record Firebase traces from the WebAppReady
 * reply, which lands after boot has already produced its first measurements. Picking a backend
 * before the answer would send those to the wrong place, and dropping them would lose the
 * boot-time vitals — so they are held here and replayed, in order, onto whatever `resolve`
 * names.
 *
 * A replayed start reaches its backend late by however long the answer took. That is harmless
 * for what can be in flight that early — finished samples, whose value is carried in a metric
 * rather than in the trace's own duration — and it is why nothing that is timed by its start and
 * stop should begin before boot completes.
 */
export class DeferredPerfTraceBackend implements PerfTraceBackend {
    /**
     * Bounds the buffer for a host that never resolves. Past the cap, new calls are dropped. That
     * can keep a start whose stop is lost — on the bridge that trace then waits out the native
     * side's expiry, unrecorded — which is acceptable because only boot-time samples are ever
     * held, far fewer than the cap.
     */
    public static readonly MAX_PENDING = 100;

    private target: PerfTraceBackend | null = null;
    private pending: Pending[] = [];

    public start(trace: PerfTraceStart): void {
        if (this.target) this.target.start(trace);
        else this.hold({ kind: 'start', trace });
    }

    public stop(result: PerfTraceResult): void {
        if (this.target) this.target.stop(result);
        else this.hold({ kind: 'stop', result });
    }

    /** Names the destination and replays everything held so far. The first answer wins. */
    public resolve(target: PerfTraceBackend): void {
        if (this.target) return;
        this.target = target;
        const pending = this.pending;
        this.pending = [];
        for (const entry of pending) {
            if (entry.kind === 'start') target.start(entry.trace);
            else target.stop(entry.result);
        }
    }

    private hold(entry: Pending): void {
        if (this.pending.length >= DeferredPerfTraceBackend.MAX_PENDING) return;
        this.pending.push(entry);
    }
}
