/**
 * Session sampling — a pure function of `runId`, and that is the whole point.
 *
 * The native shell and the WebView both need to know whether this run is
 * sampled, and they already share a `runId` (native issues it and injects it as
 * `window.CHATIC_APP_RUN_ID`). Deciding from that value alone means the two
 * runtimes reach the same answer with ZERO coordination: no bridge message to
 * carry the decision, and therefore none of the "web deploys before the app"
 * problem a new message would bring.
 *
 * The unit is one app run, not one event. A sampled run reports all of its
 * metrics and an unsampled run reports none, which keeps the distribution
 * unskewed and preserves within-session correlation ("was the run with the slow
 * boot also slow to switch?"). Per-event sampling would break both.
 */

/**
 * Percentage of runs that report metrics.
 *
 * One constant, one place. Raise it once the per-device sample counts show
 * which models are not accumulating enough runs to have a tail.
 */
export const PERF_SAMPLE_PERCENT = 10;

/**
 * FNV-1a (32-bit).
 *
 * Chosen for being short, dependency-free and byte-identical wherever it runs —
 * this value crosses a runtime boundary in effect, so "the same everywhere"
 * matters more than avalanche quality. `Math.imul` keeps the multiply in 32-bit
 * integer space instead of drifting into float territory.
 */
export const hashRunId = (runId: string): number => {
    let hash = 0x811c9dc5;

    for (let i = 0; i < runId.length; i += 1) {
        hash ^= runId.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }

    return hash >>> 0;
};

/**
 * Whether this run reports metrics.
 *
 * A missing `runId` is never sampled: without it the two runtimes cannot agree,
 * and an entry that cannot be grouped with its session is not worth the queue
 * space.
 */
export const isSampledRun = (runId: string | undefined, percent: number = PERF_SAMPLE_PERCENT): boolean => {
    if (!runId) return false;
    if (percent <= 0) return false;
    if (percent >= 100) return true;

    return hashRunId(runId) % 100 < percent;
};
