/**
 * Which deployment this page is running on.
 *
 * With `subscriptionServer.ts`, the only module under `src/app` that reads `import.meta`, and the only
 * one that reads the hostname. The stage is told apart by the host it is served from
 * (`app-dev.chatic.io` against `app.chatic.io`) and, in `vite` dev, by the dev flag; the `.env` the
 * deploy writes is read only for the account surface: its server addresses and `VITE_ENV`, which says
 * whether those addresses are production's.
 *
 * Not re-exported from any barrel: import it, and `links.ts` which reads it, by their own paths, so
 * no barrel carries `import.meta` into a module that never asked for it.
 */
export interface Stage {
    /** Served by the local dev server, where the web app runs on its own local port too. */
    isLocalhost: boolean;
    /** The dev stage: the dev app build, the dev URL scheme and the dev web origin. */
    isDevStage: boolean;
    /** Served from the production host itself, whatever build it is. */
    isProductionHost: boolean;
}

/** The production host. A CDN origin address or any other name that serves the same files is not it. */
export const PRODUCTION_HOST = 'app.chatic.io';

export const readStage = (hostname: string, devBuild: boolean): Stage => ({
    isLocalhost: hostname === 'localhost' || hostname === '127.0.0.1',
    isDevStage: devBuild || hostname.includes('-dev') || hostname.includes('app-dev'),
    isProductionHost: hostname === PRODUCTION_HOST,
});

/**
 * Whether the build's addresses are production's: `VITE_ENV=PROD` in the `.env` it was built with. The
 * production deploy writes it from the same secrets as the addresses, so the two cannot disagree there.
 */
export const readProductionBuild = (buildEnv: unknown): boolean =>
    typeof buildEnv === 'string' && buildEnv.toUpperCase() === 'PROD';

/**
 * Whether the signed-in subscription pages may exist on this host: the local dev server and the dev
 * stage, and the production host when the build is production's. Elsewhere their routes are not
 * registered and `/subscription` falls to the catch-all like any unknown path; the home page's sign-in
 * link is left out on the same test. Whether they open also needs the build's server addresses
 * (`isSubscriptionAccountOpen` in `subscriptionServer.ts`).
 *
 * On the production host the build decides, not the host alone: a dev build carries the dev server's
 * addresses, and served from `app.chatic.io` it would sign production's visitors in to the dev server
 * and take their payments there. So a dev build on the production host stays shut, and a production
 * build on any other production-looking host (a CDN origin address, say) stays shut too.
 *
 * The plans page is the one exception, open on every host: a payment provider reviews the prices on the
 * live site before any payment can be taken. Where this gate is shut it lists the plans from the fixed
 * catalog and says web checkout is coming, with nothing to sign in to.
 */
export const readSubscriptionAccountEnabled = (hostname: string, productionBuild: boolean): boolean =>
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.includes('-dev') ||
    (hostname === PRODUCTION_HOST && productionBuild);

export const { isLocalhost, isDevStage, isProductionHost } = readStage(window.location.hostname, import.meta.env.DEV);

const isProductionBuild = readProductionBuild(import.meta.env.VITE_ENV);

export const isSubscriptionAccountEnabled = readSubscriptionAccountEnabled(window.location.hostname, isProductionBuild);
