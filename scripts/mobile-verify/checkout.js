/**
 * Where this run happens: the checkout, whether it is a git worktree, and the gitignored files a
 * native build needs that a fresh worktree does not have.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { HARNESS_HOME } = require('./machine');
const { probe } = require('./proc');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Files git does not carry. Each names the platforms that need it; `web: 'local'` marks the one a
 * `--web dev` run can do without.
 */
const LOCAL_FILES = [
    { file: 'apps/mobile/.env', platforms: ['ios', 'android'], why: 'the local env the harness build starts from' },
    {
        file: 'apps/mobile/.env.dev',
        platforms: ['ios', 'android'],
        why: 'dev-build values (Google web client ID, …); without them the app dies at launch',
    },
    {
        file: 'apps/web/.env',
        platforms: ['ios', 'android'],
        web: 'local',
        why: "the env of this checkout's web dev server (the default --web local; --web dev loads the deployed dev web and does not need it)",
    },
    {
        file: 'apps/mobile/ios/Firebase/GoogleService-Info-Dev.plist',
        platforms: ['ios'],
        why: 'the "Debug Dev" configuration copies it into the app',
    },
    {
        file: 'apps/mobile/android/app/src/dev/google-services.json',
        platforms: ['android'],
        why: 'the devDebug variant fails to configure without it',
    },
];

/**
 * The main checkout when `root` is a linked worktree, else null. A worktree's git dir lives inside
 * the main checkout's `.git/worktrees/`, so the common dir's parent is the main checkout.
 */
function findMainCheckout(root = ROOT) {
    const gitDir = probe('git', ['rev-parse', '--path-format=absolute', '--git-dir'], { cwd: root }).stdout.trim();
    const commonDir = probe('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
        cwd: root,
    }).stdout.trim();
    if (!gitDir || !commonDir || gitDir === commonDir) return null;
    return path.dirname(commonDir);
}

/**
 * The gitignored files this run needs and does not have, each with the fix. In a worktree the fix
 * is a copy from the main checkout, spelled out; the runner never copies them itself, so secrets
 * only ever move by a person's (or agent's) explicit command.
 */
function missingLocalFiles({ root = ROOT, platform, web, mainCheckout = findMainCheckout(root) }) {
    return LOCAL_FILES.filter(entry => entry.platforms.includes(platform))
        .filter(entry => !(entry.web === 'local' && web !== 'local'))
        .filter(entry => !fs.existsSync(path.join(root, entry.file)))
        .map(entry => {
            const source = mainCheckout && path.join(mainCheckout, entry.file);
            const fix =
                source && fs.existsSync(source)
                    ? [`mkdir -p "${path.dirname(entry.file)}" && cp "${source}" "${entry.file}"`]
                    : [`${entry.file} is not in the repository; get it from whoever maintains the dev environment.`];
            return { message: `Missing ${entry.file} — ${entry.why}.`, fix };
        });
}

/** The harness's private directory for this checkout: derived data, TMPDIR, build records. */
function stateDirFor(root = ROOT) {
    const hash = crypto.createHash('sha256').update(root).digest('hex').slice(0, 10);
    return path.join(HARNESS_HOME, 'checkouts', `${path.basename(root)}-${hash}`);
}

module.exports = { ROOT, LOCAL_FILES, findMainCheckout, missingLocalFiles, stateDirFor };
