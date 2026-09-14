import { logger, type ObservationData } from '@chatic/bridges';

/**
 * Background-sync paths, counted separately.
 *
 * Separately because one path dying while the others live is a real state: the channel delta can
 * stall on a cursor the server rejects while profiles keep syncing. Summing them would report "sync
 * is failing" and lose the only part that locates the bug.
 */
export type SyncPath =
    | 'place-refresh'
    | 'my-profile'
    | 'channel-delta'
    | 'profile-delta'
    | 'sent-invites'
    | 'self-channel';

/**
 * Reports background-sync failures as three events instead of one per attempt.
 *
 * **Why not log every failure.** The poll runs about once a minute, so a path that is broken all day
 * would produce well over a thousand identical entries — and the only fact worth having is "this
 * device has not moved forward for N minutes". A single failure is not that fact: the next tick
 * retries with the same cursor and usually succeeds.
 *
 * So: the first failure is a `warn`, a streak reaching the threshold is one `error`, recovery is one
 * `info`, and everything between is silence. A healthy device produces nothing at all, which is what
 * makes it safe to call this from paths that run forever.
 *
 * **Recovery is logged for a reason.** With failures alone, a reader cannot tell a device that is
 * still stuck from one that healed ten minutes later — and those call for opposite responses.
 *
 * The threshold is a count of consecutive failures, not a duration, because the caller owns the
 * cadence. At the current poll interval three of them is roughly three minutes: long enough to be
 * past the ordinary transient failure, short enough to still be in front of the person about to
 * report that their list is stale.
 */
export interface ISyncStreakReporter {
    /** Records a failed attempt on `path`. Logs on the first one and when the streak hits the threshold. */
    fail(path: SyncPath, error: unknown): void;
    /** Records a successful attempt on `path`. Logs only when it ends a streak. */
    succeed(path: SyncPath): void;
    /** Drops every streak. Tests only. */
    reset(): void;
}

class SyncStreakReporter implements ISyncStreakReporter {
    /**
     * Consecutive failures before a streak is declared stuck. See the interface doc for why this is
     * a count and roughly what it means in minutes; it lives here alone so tuning it after the first
     * field data is a one-line change.
     */
    private static readonly STUCK_THRESHOLD = 3;

    private readonly streaks = new Map<SyncPath, number>();

    fail(path: SyncPath, error: unknown): void {
        const next = (this.streaks.get(path) ?? 0) + 1;
        this.streaks.set(path, next);

        if (next === 1) {
            logger.warn('SYNC', `background sync failed — ${path}`, {
                error,
                data: { observation: 'sync-streak', path, streak: next } satisfies ObservationData,
            });
            return;
        }

        if (next === SyncStreakReporter.STUCK_THRESHOLD) {
            // The watermark has not advanced for the whole streak, so the list this path feeds is
            // frozen rather than merely late. Said once: repeating it every tick would bury it.
            logger.error('SYNC', `background sync stuck — ${path}`, {
                error,
                data: { observation: 'sync-streak', path, streak: next } satisfies ObservationData,
            });
        }

        // Past the threshold there is nothing new to say.
    }

    succeed(path: SyncPath): void {
        const streak = this.streaks.get(path) ?? 0;
        if (streak === 0) return;

        this.streaks.set(path, 0);
        logger.info('SYNC', `background sync recovered — ${path}`, {
            observation: 'sync-streak',
            path,
            afterFailures: streak,
        } satisfies ObservationData);
    }

    reset(): void {
        this.streaks.clear();
    }
}

export const syncStreakReporter: ISyncStreakReporter = new SyncStreakReporter();
