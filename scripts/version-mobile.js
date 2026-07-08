#!/usr/bin/env node
/**
 * Bump mobile app versions across iOS and Android in one step.
 *
 * Usage: node scripts/version-mobile.js <major|minor|patch|build> [--no-commit]
 *
 * - major/minor/patch: bump the marketing version (semver) AND the build number.
 * - build: bump only the build number (needed to re-upload the same marketing
 *   version — stores reject duplicate versionCode/CFBundleVersion).
 *
 * Android build.gradle is treated as the single source of truth. The script
 * refuses to run when iOS values diverge from it, so a half-done manual edit
 * never silently produces mismatched store builds.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CONFIG = {
    gradlePath: 'apps/mobile/android/app/build.gradle',
    pbxprojPath: 'apps/mobile/ios/Chatic.xcodeproj/project.pbxproj',
};

const BUMP_TYPES = ['major', 'minor', 'patch', 'build'];

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parse `versionName "X.Y.Z"` and `versionCode N` out of build.gradle. */
function readGradleVersion(gradleContent) {
    const nameMatch = gradleContent.match(/versionName\s+"(\d+\.\d+\.\d+)"/);
    const codeMatch = gradleContent.match(/versionCode\s+(\d+)/);
    if (!nameMatch || !codeMatch) {
        throw new Error(`Cannot find versionName/versionCode in ${CONFIG.gradlePath}`);
    }
    return { versionName: nameMatch[1], versionCode: parseInt(codeMatch[1], 10) };
}

/** Compute the next marketing version for a semver bump type. */
function bumpSemver(version, type) {
    const [major, minor, patch] = version.split('.').map(Number);
    switch (type) {
        case 'major':
            return `${major + 1}.0.0`;
        case 'minor':
            return `${major}.${minor + 1}.0`;
        case 'patch':
            return `${major}.${minor}.${patch + 1}`;
        case 'build':
            return version;
        default:
            throw new Error(`Unknown bump type: ${type}`);
    }
}

function updateGradle(gradleContent, current, next) {
    return gradleContent
        .replace(new RegExp(`versionCode\\s+${current.versionCode}\\b`), `versionCode ${next.versionCode}`)
        .replace(
            new RegExp(`versionName\\s+"${escapeRegExp(current.versionName)}"`),
            `versionName "${next.versionName}"`
        );
}

/**
 * Replace app-target version lines in project.pbxproj.
 * Only lines whose value equals the current app version are touched, which
 * leaves the notification-extension targets (pinned at 1.0/1) untouched.
 */
function updatePbxproj(pbxContent, current, next) {
    const marketingRe = new RegExp(`(MARKETING_VERSION = )${escapeRegExp(current.versionName)};`, 'g');
    const buildNumberRe = new RegExp(`(CURRENT_PROJECT_VERSION = )${current.versionCode};`, 'g');

    // Both fields must appear the same non-zero number of times: zero means
    // iOS diverged from build.gradle, unequal counts mean a half-done edit.
    const marketingCount = (pbxContent.match(marketingRe) || []).length;
    const buildNumberCount = (pbxContent.match(buildNumberRe) || []).length;
    if (marketingCount === 0 || marketingCount !== buildNumberCount) {
        throw new Error(
            'iOS project is out of sync with build.gradle: ' +
                `found MARKETING_VERSION=${current.versionName} x${marketingCount}, ` +
                `CURRENT_PROJECT_VERSION=${current.versionCode} x${buildNumberCount}. ` +
                'Fix the version fields manually so both platforms agree, then retry.'
        );
    }

    return pbxContent.replace(marketingRe, `$1${next.versionName};`).replace(buildNumberRe, `$1${next.versionCode};`);
}

function commitVersionBump(next, type, cwd) {
    const subject =
        type === 'build'
            ? `chore(mobile): bump build number to ${next.versionCode}`
            : `chore(mobile): bump app versions ${next.versionName}`;
    const body =
        `Increments Android \`versionCode\` to ${next.versionCode} and \`versionName\` to ${next.versionName}.\n` +
        `Updates iOS \`CURRENT_PROJECT_VERSION\` to ${next.versionCode} and \`MARKETING_VERSION\` to ${next.versionName}.`;

    const add = spawnSync('git', ['add', CONFIG.gradlePath, CONFIG.pbxprojPath], { cwd, stdio: 'inherit' });
    if (add.status !== 0) throw new Error('git add failed');
    const commit = spawnSync('git', ['commit', '-m', subject, '-m', body], { cwd, stdio: 'inherit' });
    if (commit.status !== 0) throw new Error('git commit failed');
    return subject;
}

function run(argv, cwd) {
    const args = argv.filter(a => a !== '--no-commit');
    const noCommit = argv.includes('--no-commit');
    const type = args[0];

    if (!BUMP_TYPES.includes(type)) {
        console.error(`Usage: node scripts/version-mobile.js <${BUMP_TYPES.join('|')}> [--no-commit]`);
        process.exit(1);
    }

    const gradleFile = path.join(cwd, CONFIG.gradlePath);
    const pbxFile = path.join(cwd, CONFIG.pbxprojPath);
    const gradleContent = fs.readFileSync(gradleFile, 'utf8');
    const pbxContent = fs.readFileSync(pbxFile, 'utf8');

    const current = readGradleVersion(gradleContent);
    const next = {
        versionName: bumpSemver(current.versionName, type),
        // The build number always moves forward: both stores reject uploads
        // that reuse a versionCode/CFBundleVersion.
        versionCode: current.versionCode + 1,
    };

    // Validate iOS before writing anything so a failure leaves no partial edit.
    const nextPbx = updatePbxproj(pbxContent, current, next);
    const nextGradle = updateGradle(gradleContent, current, next);
    fs.writeFileSync(gradleFile, nextGradle);
    fs.writeFileSync(pbxFile, nextPbx);

    console.log(
        `Mobile version: ${current.versionName} (${current.versionCode}) -> ${next.versionName} (${next.versionCode})`
    );

    if (noCommit) {
        console.log('Skipping git commit (--no-commit).');
    } else {
        const subject = commitVersionBump(next, type, cwd);
        console.log(`Committed: ${subject}`);
    }
    return next;
}

if (require.main === module) {
    run(process.argv.slice(2), process.cwd());
}

module.exports = { readGradleVersion, bumpSemver, updateGradle, updatePbxproj, run, CONFIG };
