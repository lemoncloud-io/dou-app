import { useSyncExternalStore } from 'react';

import { backgroundClouds } from '../../../../socket/backgroundClouds';
import { getUidInCloud, subscribeSessionSignal } from '../../../store';

/**
 * Both moments the answer can move: a session change, and a cloud's tokens being issued or dropped —
 * which the per-cloud token cache announces only through the background store, not as a session
 * signal. Without the second, a screen rendered for a cloud before its tokens were issued keeps
 * `null` until some unrelated session change.
 */
const subscribe = (listener: () => void): (() => void) => {
    const offSession = subscribeSessionSignal(listener);
    const offBackground = backgroundClouds.subscribe(listener);
    return () => {
        offSession();
        offBackground();
    };
};

/**
 * The uid this account has in `cid`, re-read whenever it can have changed.
 *
 * Every cloud gives the account a different uid, and `useSessionIdentity().userId` is only the one
 * for the cloud the session has committed to. Anything that builds an id or reads a partition for a
 * named cloud — a join id `<channel>@<uid>`, "is this my message" — needs that cloud's uid instead,
 * and during a switch the two disagree: the selection has moved and the committed session has not.
 */
export const useUidInCloud = (cid: string): string | null => useSyncExternalStore(subscribe, () => getUidInCloud(cid));
