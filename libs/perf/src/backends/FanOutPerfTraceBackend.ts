import type { PerfTraceBackend } from '../PerfTrace';
import type { PerfTraceResult, PerfTraceStart } from '../types';

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
                branch.stop({ ...result, attributes: { ...result.attributes }, metrics: { ...result.metrics } });
            } catch {
                /* this branch's problem only */
            }
        }
    }
}
