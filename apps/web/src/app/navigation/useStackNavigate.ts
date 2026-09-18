import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { logger } from '@chatic/bridges';

import { readHistoryIndex } from './stackDepth';
import { resolveEntryAction, type EntryKind } from './stackPolicy';

/**
 * Performs an ENTRY transition the way `stackPolicy` says it should be performed.
 *
 * One of exactly two files in this module that may import the router — the policy, the depth
 * primitive and the tracker are all pure, and stay that way so the rules can be read without a
 * router standing up.
 *
 * `'in-app'` is not expected here. Ordinary movement inside the app calls `navigate` directly; the
 * kind exists so "no policy applies" has a name. Passing it works (it pushes) but says nothing.
 *
 * The current location is read from `window.location` rather than `useLocation`, deliberately:
 * callers reach this after awaiting cloud and site switches, so the location captured when the
 * callback was created can be several screens stale. `window.location` is the location NOW, and
 * under `createBrowserRouter` it is the same value the router itself is working from.
 */
export const useStackNavigate = (): ((entry: EntryKind, to: string) => void) => {
    const navigate = useNavigate();

    return useCallback(
        (entry: EntryKind, to: string) => {
            const { pathname, search } = window.location;
            const from = `${pathname}${search}`;
            const action = resolveEntryAction(entry, { from, to, depth: readHistoryIndex() });

            switch (action.kind) {
                case 'skip':
                    // Worth a line: "the tap did nothing" is a real report, and this is the branch
                    // that produces it legitimately.
                    logger.info('ROUTER', `[useStackNavigate] already at ${entry} target, skipping`, { to });
                    return;
                case 'back':
                    navigate(-1);
                    return;
                case 'replace':
                    navigate(to, { replace: true });
                    return;
                case 'push':
                    navigate(to);
                    return;
            }
        },
        [navigate]
    );
};
