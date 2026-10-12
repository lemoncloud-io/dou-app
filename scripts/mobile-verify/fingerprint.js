/**
 * Whether the last native build is still current. A native build takes minutes and most checks
 * change only web or React Native JavaScript, which vite and Metro serve live — so the runner
 * rebuilds only when something the native binary is made from has changed:
 *
 * - the native projects and the dependency set (committed state plus uncommitted and untracked
 *   changes under `apps/mobile/ios`, `apps/mobile/android`, `apps/mobile/package.json`, `yarn.lock`),
 * - the gitignored inputs (Firebase config, the derived env file),
 * - the ports baked in (web URL through the env file, Metro port as a build setting).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { probe } = require('./proc');

const NATIVE_PATHS = ['apps/mobile/ios', 'apps/mobile/android', 'apps/mobile/package.json', 'yarn.lock'];

function hashParts(parts) {
    const hash = crypto.createHash('sha256');
    for (const part of parts) {
        hash.update(String(part));
        hash.update('\0');
    }
    return hash.digest('hex').slice(0, 16);
}

/** The committed and uncommitted state of the native sources, as text to hash. */
function nativeSourceState(root) {
    const git = args => probe('git', args, { cwd: root, timeoutMs: 60_000 }).stdout;
    const committed = NATIVE_PATHS.map(p => git(['rev-parse', `HEAD:${p}`]).trim());
    const uncommitted = git(['diff', 'HEAD', '--', ...NATIVE_PATHS]);
    const untracked = git(['ls-files', '--others', '--exclude-standard', '-z', '--', ...NATIVE_PATHS])
        .split('\0')
        .filter(Boolean)
        .map(file => `${file}:${hashFile(path.join(root, file))}`);
    return [...committed, uncommitted, ...untracked];
}

function hashFile(file) {
    try {
        return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
    } catch {
        return 'missing';
    }
}

/**
 * The fingerprint of a build: `sourceState` from `nativeSourceState`, plus the files and settings
 * that are not in git. Two equal fingerprints mean the installed binary is the one a build would
 * produce now.
 */
function buildFingerprint({ platform, sourceState, inputFiles, settings }) {
    return hashParts([
        platform,
        ...sourceState,
        ...inputFiles.map(hashFile),
        ...Object.entries(settings).map(([key, value]) => `${key}=${value}`),
    ]);
}

module.exports = { NATIVE_PATHS, hashParts, hashFile, nativeSourceState, buildFingerprint };
