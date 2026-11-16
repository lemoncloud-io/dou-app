import type { OnRuntimeSessionChangedPayload } from '@chatic/bridge-messages';
import { logger } from '@chatic/logger';

import type { SessionSnapshot, SessionView } from '../../session/snapshot';
import { SESSION_LOGOUT_SIGNAL } from '../contract';
import { shareStructure } from './shareStructure';

/** The session view a mirror keeps, and the way a session push reaches it. */
export interface SessionMirror extends SessionView {
    /** Takes a session push. One numbered at or below the last one taken is late and is dropped. */
    apply(payload: OnRuntimeSessionChangedPayload): void;
    /** The number of the snapshot the mirror holds. */
    seq(): number;
}

/**
 * The session as a page that mirrors the shell's runtime reads it: the hello's snapshot, then each
 * session push in number order.
 *
 * - **Late pushes are dropped.** A push numbered at or below the one held is older than what the page
 *   already shows.
 * - **Identities are kept.** Each part of a pushed snapshot that equals the part held is the held
 *   object, so a reader of one part does not re-render for a change in another (`shareStructure`), and a
 *   push that changed nothing notifies no one.
 * - **A sign-out is a signal.** A push carrying `logout` runs the `onLogout` listeners once the new
 *   snapshot is in place, each guarded so one that throws does not stop the rest.
 */
export const createSessionMirror = (initial: { seq: number; session: SessionSnapshot }): SessionMirror => {
    let seq = initial.seq;
    let snapshot = initial.session;
    const listeners = new Set<() => void>();
    const logoutListeners = new Set<() => void>();

    const runEach = (each: Set<() => void>, what: string) =>
        [...each].forEach(listener => {
            try {
                listener();
            } catch (error) {
                logger.error('AUTH', what, { error });
            }
        });

    return {
        snapshot: () => snapshot,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        onLogout: listener => {
            logoutListeners.add(listener);
            return () => logoutListeners.delete(listener);
        },
        seq: () => seq,
        apply: payload => {
            if (typeof payload?.seq !== 'number' || payload.seq <= seq) return;
            seq = payload.seq;
            const next = shareStructure(snapshot, payload.session as unknown as SessionSnapshot);
            if (next !== snapshot) {
                snapshot = next;
                runEach(listeners, 'A session listener threw');
            }
            if (Array.isArray(payload.signals) && payload.signals.includes(SESSION_LOGOUT_SIGNAL)) {
                runEach(logoutListeners, 'A sign-out listener threw');
            }
        },
    };
};
