import type { Env } from '@chatic/app-messages';

/**
 * Translates this build's `VITE_ENV` into the `Env` vocabulary the web and the push API speak.
 *
 * Two vocabularies exist for the same idea and they are not interchangeable: `VITE_ENV` is
 * `LOCAL | DEV | PROD` (uppercase), while `Env` — what `window.CHATIC_APP_STAGE` is read back as —
 * is `local | stage | prod`. The shell used to inject the raw `VITE_ENV`, so `libs/config`'s
 * `webEnvAdapter.stage()` matched none of its three cases and silently fell back to the web's own
 * build stage, making the injected value inert. This function is what makes it land.
 *
 * `PROD` and anything unrecognized both map to `'prod'`. That mirrors the previous
 * `Config.VITE_ENV || 'PROD'` fallback: a build whose env file failed to load must not present
 * itself as a lower environment.
 */
export const toEnvStage = (raw: string | undefined): Env => {
    switch ((raw ?? '').toUpperCase()) {
        case 'LOCAL':
            return 'local';
        case 'DEV':
            return 'stage';
        default:
            return 'prod';
    }
};
