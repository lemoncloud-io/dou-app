import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { logger } from '@chatic/bridges';

import { readHistoryIndex } from './stackDepth';
import { resolveEntryAction, type EntryKind } from './stackPolicy';
import { routeStackTracker } from './stackTracker';

/**
 * How long a rewind is given to land before the push goes ahead regardless.
 *
 * `history.go` is asynchronous and reports completion only through `popstate`, which does not fire
 * at all if there was nothing to rewind. The ceiling is what keeps a tap from doing nothing in that
 * case. Generous next to a same-document pop, which lands in a frame or two.
 */
const REWIND_TIMEOUT_MS = 300;

/**
 * Performs an ENTRY transition the way `stackPolicy` says it should be performed.
 *
 * One of exactly two files in this module that may import the router — the policy, the depth
 * primitive, the graph reader and the tracker are all pure, and stay that way so the rules can be
 * read without a router standing up.
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
            const snapshot = routeStackTracker.getSnapshot();
            const action = resolveEntryAction(entry, {
                from,
                to,
                depth: readHistoryIndex(),
                // Only trustworthy while every transition carried a readable index; once one did
                // not, the reconstruction has a hole in it of unknown size and the graph rule must
                // fall back rather than rewind by a number derived from it.
                stack: snapshot.isIndexed ? snapshot.entries.map(item => item.pathname) : undefined,
            });

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
                case 'rewind-then-push': {
                    logger.info('ROUTER', `[useStackNavigate] collapsing feature graph before ${entry} entry`, {
                        to,
                        steps: action.steps,
                    });

                    // The two halves cannot be issued together. `history.go` is asynchronous, and
                    // pushing in the same tick would push onto the entry we are still standing on
                    // — leaving the graph in the stack and putting the target above it, which is
                    // the arrangement this whole rule exists to avoid.
                    let done = false;
                    const push = () => {
                        if (done) return;
                        done = true;
                        window.removeEventListener('popstate', onPop);
                        window.clearTimeout(timer);
                        navigate(to);
                    };
                    // One frame after the pop, so the router has finished its own handling of it
                    // before another navigation is started on top.
                    const onPop = () => requestAnimationFrame(push);

                    window.addEventListener('popstate', onPop);
                    const timer = window.setTimeout(push, REWIND_TIMEOUT_MS);

                    navigate(-action.steps);
                    return;
                }
            }
        },
        [navigate]
    );
};
