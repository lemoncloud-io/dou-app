export const PERF_SAMPLE_PERCENT = 10;

export const hashRunId = (runId: string): number => {
    let hash = 0x811c9dc5;

    for (let i = 0; i < runId.length; i += 1) {
        hash ^= runId.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }

    return hash >>> 0;
};

export const isSampledRun = (runId: string | undefined, percent: number = PERF_SAMPLE_PERCENT): boolean => {
    if (!runId) return false;
    if (percent <= 0) return false;
    if (percent >= 100) return true;

    return hashRunId(runId) % 100 < percent;
};
