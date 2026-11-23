import type { OnRuntimeSessionChangedPayload } from '@chatic/bridge-messages';
import { logger } from '@chatic/logger';

import type { SessionSnapshot, SessionView } from '../../session/snapshot';
import { SESSION_LOGOUT_SIGNAL } from '../contract';
import { shareStructure } from './shareStructure';

export interface SessionMirror extends SessionView {
    apply(payload: OnRuntimeSessionChangedPayload): void;
    seq(): number;
}

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
