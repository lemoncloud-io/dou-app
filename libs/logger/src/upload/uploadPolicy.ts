/**
 * The timing and give-up policy the scheduler enforces, kept separate from the
 * machine that applies it so the numbers can be read (and overridden) without
 * reading the state machine.
 */

/** What the server's answer means for the batch that was sent. */
export type UploadOutcome =
    /** 2xx — accepted (individually dropped items included). Remove the batch. */
    | 'ok'
    /** 4xx — the request will never succeed as-is. Discard without retrying. */
    | 'discard'
    /** 5xx or transport failure — worth another attempt. */
    | 'retry';

export type TimerHandle = ReturnType<typeof setTimeout>;

export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_INTERVAL_MS = 60_000;
/** An error pulls the next batch in to this delay — not to zero. */
export const DEFAULT_ERROR_ADVANCE_MS = 5_000;
export const DEFAULT_BACKOFF_MS = [5_000, 30_000, 120_000];
/**
 * Attempts for one batch before it is given up on.
 *
 * This is what guarantees termination. Without it a server that answers 5xx to
 * something it will never accept — an expired session, say — would have the
 * client resending the same batch forever. With it the client stops on its own,
 * so termination does not depend on the server choosing 4xx over 5xx.
 */
export const DEFAULT_MAX_ATTEMPTS = 5;
