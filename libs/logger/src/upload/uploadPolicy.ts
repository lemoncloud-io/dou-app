export type UploadOutcome = 'ok' | 'discard' | 'retry';

export type TimerHandle = ReturnType<typeof setTimeout>;

export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_INTERVAL_MS = 60_000;
export const DEFAULT_BACKOFF_MS = [5_000, 30_000, 120_000];
export const DEFAULT_MAX_ATTEMPTS = 5;
