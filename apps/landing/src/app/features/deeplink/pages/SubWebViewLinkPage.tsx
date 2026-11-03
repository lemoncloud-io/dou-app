import { useEffect, type JSX } from 'react';
import { Navigate } from 'react-router-dom';

import { subWebViewPageUrlOfAppLink } from '@chatic/shared';

/**
 * `/apps/<label>/…` — a link to a sub WebView page that reached the browser rather than the app: the
 * app is not installed, or the link was opened somewhere the OS never saw it. The page works in a
 * browser too, so the visitor goes straight to it, with the link's path, query and fragment, instead
 * of to a bounce page that would ask them to install the app first. Anything this host cannot map —
 * a local or preview host, a malformed label — goes home.
 */
export const SubWebViewLinkPage = (): JSX.Element | null => {
    const pageUrl = subWebViewPageUrlOfAppLink(window.location.href);

    useEffect(() => {
        // `replace`, so the browser's back button does not land on this redirect again.
        if (pageUrl) window.location.replace(pageUrl);
    }, [pageUrl]);

    return pageUrl ? null : <Navigate to="/" replace />;
};
