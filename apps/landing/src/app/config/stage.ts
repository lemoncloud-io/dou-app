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

export const { isLocalhost, isDevStage } = readStage(window.location.hostname, import.meta.env.DEV);
