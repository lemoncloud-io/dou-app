/**
 * The build's own values, read from `import.meta.env` — the one module under `src/config/` that touches
 * it. Kept on its own because the CommonJS test transform cannot parse `import.meta`: the declarations'
 * specs replace this module and load every other one as it is.
 */

/** A `VITE_*` value this build was made with. */
export const readBuildValue = (name: string): string | undefined =>
    (import.meta.env as Record<string, string | undefined>)[name];

/**
 * The web's own switch to stop asking the shell to hold the session (`VITE_SESSION_MIRROR_DISABLED`):
 * set, every launch is the page's, whatever the installed shell offers — except in an app process whose
 * shell already holds the session and says so (`held`), which the page still mirrors.
 */
export const sessionMirrorDisabled = (): boolean => import.meta.env.VITE_SESSION_MIRROR_DISABLED === 'true';
