import type { JSX } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { logger } from '@chatic/bridges';

import { buildEncodedInviteEntryParams } from '../features/invite/utils/buildEncodedInviteEntryParams';
import { ROUTES } from './paths';

/**
 * Handles `/i?t=…` — the encoded share link — on the web origin, exactly as `ShareLinkRedirect`
 * handles `/s?code=…`.
 *
 * The web owning this path is not redundant with landing owning it. The mobile WebView hands some
 * links straight through, and a native build that predates the `/i` format has no branch for it at
 * all, so the link arrives here verbatim; without this route it falls to the router's `*` fallback,
 * which redirects to `/` and drops the query string — the invite disappears without a trace. That
 * matters more for `/i` than it did for `/s`: the native side only reaches users through a store
 * release, while this ships with the web bundle every installed app already loads.
 *
 * A token we cannot read falls back to `/`. There is nothing useful to show for it, and the home
 * screen is the right landing spot.
 *
 * A readable one lands on `/` for InviteEntryGate to forward, rather than going straight to
 * `/invite/accept` — every entry path deferring to that one gate is what keeps a single answer to
 * "does onboarding go first". The extra hop is a `<Navigate replace>`, so home never renders.
 */
export const EncodedLinkRedirect = (): JSX.Element => {
    const { search } = useLocation();

    // Widened from the `'/'` literal `ROUTES.root` carries: the success path appends a query string.
    let target: string = ROUTES.root;
    try {
        target = `${ROUTES.root}?${buildEncodedInviteEntryParams(search).toString()}`;
    } catch (error) {
        logger.warn('DEEPLINK', '[EncodedLinkRedirect] unreadable encoded invite link, falling back to root', {
            search,
            error,
        });
    }

    return <Navigate to={target} replace />;
};
