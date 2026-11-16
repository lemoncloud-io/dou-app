import { toEnvStage } from '../../utils/stage';
import type { AppRestart } from '../appRestart/appRestart';
import { readSessionOwner, writeSessionOwner } from './sessionOwner';
import type { SessionOwner, SessionOwnerFile } from './sessionOwner';

/**
 * Whether this build offers the owner switch: a local or a test stage build, never production. The
 * stage is the one baked into the build (`VITE_ENV`), which nothing in a page can change. A value this
 * build does not recognise — an env file that failed to load — counts as production, as it does
 * everywhere the app reads its stage: a production build must not open the switch by accident.
 */
export const isSessionOwnerSwitchAllowed = (stage: string | undefined): boolean => toEnvStage(stage) !== 'prod';

/**
 * How long a switch waits before restarting, so its answer reaches the page first. The page is reloaded
 * by the restart either way; the wait only lets it say what is about to happen.
 */
export const SESSION_OWNER_RESTART_DELAY_MS = 300;

export interface SessionOwnerSwitchDeps {
    /** The owner this JS context started with (`launchSessionOwner`). */
    current: () => SessionOwner;
    /** The file the owner is recorded in for the next start. */
    file: () => SessionOwnerFile;
    restart: Pick<AppRestart, 'restart'>;
    schedule?: (run: () => void, ms: number) => () => void;
}

const scheduleTimeout = (run: () => void, ms: number): (() => void) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
};

/**
 * The development switch for who holds the session. Reading answers the current owner and the one
 * recorded for the next start; setting records the owner and, when it differs from the current one,
 * starts the JS context over so it takes effect now — the owner is settled once per context, so nothing
 * short of a restart can change it.
 *
 * One restart is ever pending: a second tap does not schedule another, and setting the current owner
 * back before it fires calls it off.
 */
export const createSessionOwnerSwitch = ({
    current,
    file,
    restart,
    schedule = scheduleTimeout,
}: SessionOwnerSwitchDeps) => {
    let cancelPending: (() => void) | null = null;

    return {
        read: (): { current: SessionOwner; next: SessionOwner } => ({
            current: current(),
            next: readSessionOwner(file()),
        }),
        set: (owner: SessionOwner): { next: SessionOwner; restarting: boolean } => {
            writeSessionOwner(file(), owner);
            const restarting = owner !== current();
            if (!restarting) {
                cancelPending?.();
                cancelPending = null;
            } else if (!cancelPending) {
                cancelPending = schedule(() => {
                    cancelPending = null;
                    void restart.restart({ reason: 'session-owner-changed' });
                }, SESSION_OWNER_RESTART_DELAY_MS);
            }
            return { next: owner, restarting };
        },
    };
};
