import type { PerfTraceBackend } from '../PerfTrace';
import type { PerfTraceResult, PerfTraceStart } from '../types';

type Pending = { kind: 'start'; trace: PerfTraceStart } | { kind: 'stop'; result: PerfTraceResult };

export class DeferredPerfTraceBackend implements PerfTraceBackend {
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
