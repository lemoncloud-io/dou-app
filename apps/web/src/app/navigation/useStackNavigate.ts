import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { logger } from '@chatic/bridges';

import { readHistoryIndex } from './stackDepth';
import { resolveEntryAction, type EntryKind } from './stackPolicy';
import { routeStackTracker } from './stackTracker';

const REWIND_TIMEOUT_MS = 300;

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
                stack: snapshot.isIndexed ? snapshot.entries.map(item => item.pathname) : undefined,
            });

            switch (action.kind) {
                case 'skip':
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

                    let done = false;
                    const push = () => {
                        if (done) return;
                        done = true;
                        window.removeEventListener('popstate', onPop);
                        window.clearTimeout(timer);
                        navigate(to);
                    };
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
