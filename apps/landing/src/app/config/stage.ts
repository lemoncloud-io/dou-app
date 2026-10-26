/**
 * Which deployment this page is running on.
 *
 * The only module under `src/app` that reads `import.meta` or the hostname. The `.env` the deploy
 * writes carries nothing this site reads at runtime: the stage is told apart by the host it is
 * served from (`app-dev.chatic.io` against `app.chatic.io`) and, in `vite` dev, by the dev flag.
 *
 * Not re-exported from any barrel: import it, and `links.ts` which reads it, by their own paths, so
 * no barrel carries `import.meta` into a module that never asked for it.
 */
export interface Stage {
    /** Served by the local dev server, where the web app runs on its own local port too. */
    isLocalhost: boolean;
    /** The dev stage: the dev app build, the dev URL scheme and the dev web origin. */
    isDevStage: boolean;
}

export const readStage = (hostname: string, devBuild: boolean): Stage => ({
    isLocalhost: hostname === 'localhost' || hostname === '127.0.0.1',
    isDevStage: devBuild || hostname.includes('-dev') || hostname.includes('app-dev'),
});

/**
 * Whether the signed-in subscription pages exist on this host: the local dev server and the dev
 * stage, never production. They take no real payment yet, so on `app.chatic.io` their routes are not
 * registered at all and `/subscription` falls to the catch-all like any unknown path; the home
 * page's links into them are left out on the same test.
 *
 * Decided by the hostname alone, unlike `isDevStage`: a dev build served from the production host
 * must still keep these pages shut.
 */
export const readSubscriptionWebEnabled = (hostname: string): boolean =>
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('-dev');

export const { isLocalhost, isDevStage } = readStage(window.location.hostname, import.meta.env.DEV);

export const isSubscriptionWebEnabled = readSubscriptionWebEnabled(window.location.hostname);
