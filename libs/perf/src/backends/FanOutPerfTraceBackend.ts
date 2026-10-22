import type { PerfTraceBackend } from '../PerfTrace';
import type { PerfTraceResult, PerfTraceStart } from '../types';

/**
 * Hands every start and stop to several backends — Firebase (directly, or over the bridge) and the
 * log pipeline, side by side.
 *
 * **One branch failing never costs another its record.** Each call is made on its own and a throw is
 * swallowed: a Firebase SDK that refuses a value, or a pipeline whose recorder is not wired yet, is
 * the problem of that branch alone. Measurement must never surface as an app error either, so
 * nothing is re-thrown.
 *
 * Wrap the whole fan-out in the deferring backend rather than deferring each branch on its own:
 * held calls are then released to every branch in one order, so no branch sees a stop before its
 * start.
 */
export class FanOutPerfTraceBackend implements PerfTraceBackend {
    private readonly branches: readonly PerfTraceBackend[];

    constructor(branches: readonly PerfTraceBackend[]) {
        this.branches = [...branches];
    }

    public start(trace: PerfTraceStart): void {
        for (const branch of this.branches) {
            try {
                branch.start(trace);
            } catch {
                /* this branch's problem only */
            }
        }
    }

    public stop(result: PerfTraceResult): void {
        for (const branch of this.branches) {
            try {
                // Each branch gets its own copy. None edits what it is handed today, but a branch that
                // did would otherwise change what the next one records.
                branch.stop({ ...result, attributes: { ...result.attributes }, metrics: { ...result.metrics } });
            } catch {
                /* this branch's problem only */
            }
        }
    }
}
