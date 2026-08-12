import type { JSX } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { logger } from '@chatic/bridges';

import { buildInviteEntryParams } from '../features/invite/utils/buildInviteEntryParams';
import { ROUTES } from './paths';

/**
 * Handles `/s?code=…` — the raw share-link path — on the web origin.
 *
 * `/s` normally belongs to the landing app, which converts share links before sending users here.
 * The mobile WebView, however, hands some links straight through: a link the native converter does
 * not recognize (a relay link carrying only `code`, with no `api`/`stage`/`backend`/`relay`) reaches
 * the WebView as `/s?code=…`, and without this route it falls to the router's `*` fallback, which
 * redirects to `/` and drops the query string — the invite silently disappears.
 *
 * Handling it here rather than in the native converter fixes every already-installed app version at
 * once, with no store release: the fix ships with the web bundle the WebView loads.
 *
 * A link we cannot convert (no `code`, or a half-specified cloud address) falls back to `/` — there
 * is nothing useful to show, and the home screen is the right landing spot.
 *
 * A convertible one lands on `/` for InviteEntryGate to forward, rather than going straight to
 * `/invite/accept`. Every entry path deferring to the one gate is what keeps a single answer to "does
 * onboarding go first" — jumping the queue here would silently skip it. The extra hop is a
 * `<Navigate replace>`, so home never renders.
 */
export const ShareLinkRedirect = (): JSX.Element => {
    const { search } = useLocation();

    // Widened from the `'/'` literal `ROUTES.root` carries: the success path appends a query string.
    let target: string = ROUTES.root;
    try {
        target = `${ROUTES.root}?${buildInviteEntryParams(search).toString()}`;
    } catch (error) {
        logger.warn('DEEPLINK', '[ShareLinkRedirect] unconvertible share link, falling back to root', {
            search,
            error,
        });
    }

    return <Navigate to={target} replace />;
};
