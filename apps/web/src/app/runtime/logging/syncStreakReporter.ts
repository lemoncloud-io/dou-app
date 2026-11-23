import { logger, type ObservationData } from '@chatic/bridges';

export type SyncPath =
    | 'place-refresh'
    | 'my-profile'
    | 'channel-delta'
    | 'profile-delta'
    | 'sent-invites'
    | 'self-channel';

export interface ISyncStreakReporter {
    fail(path: SyncPath, error: unknown): void;
    succeed(path: SyncPath): void;
    reset(): void;
}

class SyncStreakReporter implements ISyncStreakReporter {
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
            logger.error('SYNC', `background sync stuck — ${path}`, {
                error,
                data: { observation: 'sync-streak', path, streak: next } satisfies ObservationData,
            });
        }
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
