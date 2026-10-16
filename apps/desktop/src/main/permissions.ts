import { isTrustedUrl } from './webUrl';

/** What the app's own pages use, granted to any page. */
const ALWAYS_GRANTED = new Set(['notifications', 'clipboard-sanitized-write']);

/**
 * Whether a permission request from the renderer is granted. The renderer is remote-loaded web
 * content, so everything the app does not use is denied, instead of Electron's allow-all default.
 *
 * `fullscreen` is what a `<video controls>` fullscreen button asks for. Denied, Chromium neither
 * enters fullscreen nor settles the page's `requestFullscreen()`, so the button silently does
 * nothing. It is granted to the app's own origins only: a page from elsewhere has no business
 * taking over the screen.
 */
export const grantsPermission = (permission: string, requestingUrl: string | undefined): boolean =>
    ALWAYS_GRANTED.has(permission) || (permission === 'fullscreen' && isTrustedUrl(requestingUrl));
