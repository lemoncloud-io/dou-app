import { toEnvStage } from '../../utils/stage';
import type { AppRestart } from '../appRestart/appRestart';
import { readSessionOwner, writeSessionOwner } from './sessionOwner';
import type { SessionOwner, SessionOwnerFile } from './sessionOwner';

export const isSessionOwnerSwitchAllowed = (stage: string | undefined, debugModeEnabled: boolean): boolean =>
    toEnvStage(stage) !== 'prod' || debugModeEnabled;

export const SESSION_OWNER_RESTART_DELAY_MS = 300;

export interface SessionOwnerSwitchDeps {
    current: () => SessionOwner;
    file: () => SessionOwnerFile;
    fallback?: () => SessionOwner;
    restart: Pick<AppRestart, 'restart'>;
    schedule?: (run: () => void, ms: number) => () => void;
}

const scheduleTimeout = (run: () => void, ms: number): (() => void) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
};

export const createSessionOwnerSwitch = ({
    current,
    file,
    fallback = () => 'web',
    restart,
    schedule = scheduleTimeout,
}: SessionOwnerSwitchDeps) => {
    let cancelPending: (() => void) | null = null;

    return {
        read: (): { current: SessionOwner; next: SessionOwner } => ({
            current: current(),
            next: readSessionOwner(file(), fallback()),
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

export type SessionOwnerSwitch = ReturnType<typeof createSessionOwnerSwitch>;
