/**
 * The env file a harness build reads (`ENVFILE`). It is derived, never committed and never printed:
 *
 * - `--web local` starts from `.env.dev` (the values a dev build needs, like the Google web client
 *   ID, without which the Android app dies at module load), lays the non-empty values of `.env` (the
 *   local env) over it, and points `VITE_WEBVIEW_BASE_URL` at the harness's own web port.
 * - `--web dev` is `.env.dev` as it is: the deployed dev web.
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

/** Write with owner-only permissions: it carries the same values as the gitignored env files. */
function writeEnvFile(file, values) {
    fs.writeFileSync(file, serializeEnv(values), { mode: 0o600 });
}

module.exports = { parseEnv, serializeEnv, deriveEnv, writeEnvFile };
