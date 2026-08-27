/**
 * How many entries this run has lost to queue backpressure.
 *
 * Metrics ride the same queue as everything else, and `info` is dropped right
 * after `debug` when that queue fills. The ordering is correct — diagnostics
 * should outrank measurements — but it is not random: a device that logs a lot
 * fills the queue, and such devices are generally the slow ones. Left alone,
 * the samples that make the p95 disappear first and the distribution reads
 * optimistic. So the loss is made observable instead of hidden.
 *
 * Cumulative and never consumed: a delta would vanish with the very entry
 * carrying it, whereas a running total survives in whichever entry gets through.
 *
 * A plain integer add is all this may ever do. It is called from inside
 * `queue.push`, which runs inside a hub publish — anything that logs there
 * re-enters and recurses (unified-logging principle 8).
 */

let total = 0;

export const noteQueueDrops = (count: number): void => {
    if (count > 0) total += count;
};

export const readQueueDropTotal = (): number => total;

/** Test seam. */
export const resetQueueDropTotal = (): void => {
    total = 0;
};
