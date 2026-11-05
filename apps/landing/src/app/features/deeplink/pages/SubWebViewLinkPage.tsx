import { type JSX } from 'react';
import { Navigate } from 'react-router-dom';

import { readSubWebViewAppLink } from '@chatic/shared';

import { DeepLinkPage } from './DeepLinkPage';

/**
 * `/apps/<appId>?<query>` — a link to a sub WebView page that reached the browser rather than the app:
 * the app is not installed, or the link was opened somewhere the OS never saw it (an in-app browser).
 * The page it names is meant to run in the app, so this never sends the browser to it: it tries the
 * app as an invite does — through the custom scheme, which the app reads as the same link — and offers
 * the store where the app is missing. Anything that does not read as a page link — a local or preview
 * host, a malformed id, a path after it — goes home.
 *
 * Read without the fragment: a link carries none, but the Android launch comes back to this page with
 * the app-missing marker as one, and that page has to offer the store rather than go home.
 */
export const SubWebViewLinkPage = (): JSX.Element => {
    const { origin, pathname, search } = window.location;
    return readSubWebViewAppLink(`${origin}${pathname}${search}`) ? (
        <DeepLinkPage appOnly />
    ) : (
        <Navigate to="/" replace />
    );
};
