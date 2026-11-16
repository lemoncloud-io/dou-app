/**
 * The env file a harness build reads (`ENVFILE`). It is derived, never committed and never printed:
 *
 * - `--web local` starts from `.env.dev` (the values a dev build needs, like the Google web client
 *   ID, without which the Android app dies at module load), lays the non-empty values of `.env` (the
 *   local env) over it, and points `VITE_WEBVIEW_BASE_URL` at the harness's own web port.
 * - `--web dev` is `.env.dev` as it is: the deployed dev web.
 *
 * - A `--web local` build also carries the services the app's own runtime starts with
 *   (`NATIVE_RUNTIME_ENV_KEYS`), so one build serves both session owners. A mobile env leaves them
 *   empty, since only that runtime reads them; they are taken from the web app's env, which names the
 *   same services, unless the two envs name different stages (`withNativeRuntimeEnv`). Only
 *   `--session-owner native` stops on a mismatch or a gap; a page-owned launch never reads them.
 *
 * The file is written under the harness's cache directory, outside the checkout, so a run adds no
 * file to the tree; react-native-config accepts an absolute `ENVFILE` on both platforms.
 */
const fs = require('fs');

function parseEnv(text) {
    const values = new Map();
    for (const line of text.split('\n')) {
        const match = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*?)\s*$/);
        if (!match) continue;
        values.set(match[1], match[2].replace(/^(['"])(.*)\1$/, '$2'));
    }
    return values;
}

function serializeEnv(values) {
    return [...values].map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
}

/** The merged values for a run; see the module comment for the rule. */
function deriveEnv({ localText, devText, web, webUrl }) {
    const merged = parseEnv(devText);
    if (web === 'dev') return merged;
    for (const [key, value] of parseEnv(localText)) {
        if (value !== '') merged.set(key, value);
    }
    merged.set('VITE_WEBVIEW_BASE_URL', webUrl);
    return merged;
}

/**
 * The build values the app's own runtime cannot start without — `NATIVE_RUNTIME_ENV_KEYS` in
 * libs/runtime-mobile/src/boot.ts, which a test keeps this list equal to. Without them the runtime's
 * boot fails, and the page keeps the session though the launch was set to the app's runtime.
 */
const NATIVE_RUNTIME_ENV_KEYS = [
    'VITE_ENV',
    'VITE_PROJECT',
    'VITE_HOST',
    'VITE_OAUTH_ENDPOINT',
    'VITE_SOCIAL_OAUTH_ENDPOINT',
    'VITE_BACKEND_ENDPOINT',
    'VITE_WS_ENDPOINT',
    'VITE_DOU_ENDPOINT',
];

/**
 * Fills the runtime's values a merged mobile env leaves empty from the web app's env (`webText`).
 * Fills nothing when the two envs name different stages (`VITE_ENV`): the runtime would then sign in
 * against one stage's services while the page loads another's. `VITE_ENV` itself is never taken from
 * the web: it is the app's own stage, which also decides whether the development switch is offered.
 * Returns the values, the names still empty, and whether the stages differ — never the values
 * themselves in a message.
 */
function withNativeRuntimeEnv(merged, webText) {
    const web = parseEnv(webText);
    const values = new Map(merged);
    const stage = values.get('VITE_ENV');
    const webStage = web.get('VITE_ENV');
    if (stage && webStage && stage !== webStage) return { values, missing: [], stageMismatch: true };
    for (const key of NATIVE_RUNTIME_ENV_KEYS) {
        if (key !== 'VITE_ENV' && !values.get(key) && web.get(key)) values.set(key, web.get(key));
    }
    return { values, missing: NATIVE_RUNTIME_ENV_KEYS.filter(key => !values.get(key)), stageMismatch: false };
}

/** Write with owner-only permissions: it carries the same values as the gitignored env files. */
function writeEnvFile(file, values) {
    fs.writeFileSync(file, serializeEnv(values), { mode: 0o600 });
}

module.exports = { NATIVE_RUNTIME_ENV_KEYS, parseEnv, serializeEnv, deriveEnv, withNativeRuntimeEnv, writeEnvFile };
