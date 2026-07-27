import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { net, protocol } from 'electron';

import { isDocumentRequest, resolveEntryPath } from './customUi';
import { CUSTOM_UI_SCHEME, isCustomUiUrl } from './webUrl';

/**
 * Privileges the custom-UI scheme needs, registered before app ready.
 *
 * - `standard` — gives the scheme a real origin, so relative asset URLs resolve and the
 *   bundle gets a storage partition instead of an opaque one.
 * - `secure` — marks it a secure context; without it IndexedDB, crypto.subtle and service
 *   workers are unavailable and the web build fails at boot.
 * - `supportFetchAPI` + `corsEnabled` — let the bundle issue ordinary cross-origin fetches
 *   to the backend. Without `corsEnabled` CORS is not merely strict, it is off, and every
 *   API call fails regardless of what the server allows.
 */
export const CUSTOM_UI_SCHEME_PRIVILEGES = {
    scheme: CUSTOM_UI_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
} as const;

let handled = false;

const notFound = (): Response => new Response('Not found', { status: 404 });

/**
 * Serve one file, or null when it is not there. Absence is checked in both shapes net.fetch
 * can express it — a rejection and a non-ok response — so the caller does not depend on
 * which one a given Electron build picks for a missing `file:` URL.
 */
const fileResponse = async (path: string): Promise<Response | null> => {
    try {
        const response = await net.fetch(pathToFileURL(path).toString());
        return response.ok ? response : null;
    } catch {
        return null;
    }
};

/** Serve `root` under the custom-UI scheme, replacing any bundle already served. Requires app ready. */
export const registerCustomUiProtocol = (root: string): void => {
    // protocol.handle throws on a scheme that already has a handler, and re-applying a
    // bundle is the normal path — drop the previous one first. The flag tracks what is
    // actually registered (unhandle throws on a scheme with no handler), so it is cleared
    // before handle() and only set after it returns.
    if (handled) protocol.unhandle(CUSTOM_UI_SCHEME);
    handled = false;
    protocol.handle(CUSTOM_UI_SCHEME, async request => {
        // handle() claims the whole scheme, so `chatic-local://anything/` would otherwise
        // serve the bundle under an origin safeOrigin refuses to trust. Serve only the host
        // the shell actually navigates to, so what is served and what is trusted agree.
        if (!isCustomUiUrl(request.url)) return notFound();
        const entry = resolveEntryPath(root, request.url);
        // Null means the path left the root. That gets a 404 and never the fallback below —
        // a traversal attempt answered with 200 tells the caller the shape is worth refining.
        if (!entry) return notFound();
        const direct = await fileResponse(entry);
        if (direct) return direct;
        // Missing file. A client route needs the entry point; anything else is a bundle
        // referencing an asset it did not ship, and should hear so.
        if (!isDocumentRequest(request.headers.get('accept'))) return notFound();
        // index.html sits inside root by construction, so this adds no traversal surface.
        return (await fileResponse(join(root, 'index.html'))) ?? notFound();
    });
    handled = true;
};

/** Stop serving the custom-UI scheme. Safe to call when nothing is registered. */
export const unregisterCustomUiProtocol = (): void => {
    if (!handled) return;
    protocol.unhandle(CUSTOM_UI_SCHEME);
    handled = false;
};
