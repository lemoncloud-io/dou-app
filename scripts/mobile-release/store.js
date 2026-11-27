const fs = require('fs');
const os = require('os');
const path = require('path');

const io = require('./io');

const STATUSES = {
    uploaded: 'uploaded',
    incomplete: 'uploaded, lane failed after the upload (check the store notes)',
    failed: 'failed',
    skipped: 'skipped',
};
const UPLOADED = ['uploaded', 'incomplete'];

function storeBuildCommand(platform, env, out) {
    return ['fastlane', [platform, 'latest_build', `env:${env}`, `out:${out}`]];
}

function readStoreBuild(platform, env, deps) {
    const out = path.join(deps.tmpdir(), `mobile-store-build-${platform}-${env}-${process.pid}.txt`);
    deps.remove(out);
    const [command, args] = storeBuildCommand(platform, env, out);
    const status = deps.run(command, args, {}, path.join(deps.root, 'apps/mobile'));
    const text = status === 0 ? deps.read(out) : null;
    deps.remove(out);
    if (text === null || !/^\d+$/.test(text.trim())) {
        throw new Error(
            `Could not read the latest ${platform} ${env} build number from the store` +
                `${status === 0 ? '' : ` (exit ${status})`}; stopping so the build number cannot clash`
        );
    }
    return Number(text.trim());
}

function storeFloor(platforms, env, deps) {
    const byPlatform = {};
    for (const platform of platforms) byPlatform[platform] = readStoreBuild(platform, env, deps);
    return { byPlatform, max: Math.max(0, ...Object.values(byPlatform)) };
}

function parseResults(text) {
    const results = {};
    for (const item of (text || '').split(/[,;]/)) {
        const [platform, status] = item.split('=').map(part => (part || '').trim());
        if (!platform) continue;
        const value = status || 'uploaded';
        if (!STATUSES[value]) throw new Error(`Unknown upload result ${value} for ${platform}`);
        results[platform] = value;
    }
    return results;
}

function formatResults(results) {
    return Object.entries(results)
        .map(([platform, status]) => `${platform}=${status}`)
        .join(', ');
}

function uploadedPlatforms(results) {
    return Object.keys(results).filter(platform => UPLOADED.includes(results[platform]));
}

function mergeResults(previous, next) {
    const merged = { ...previous };
    for (const [platform, status] of Object.entries(next)) {
        if (!UPLOADED.includes(merged[platform]) || UPLOADED.includes(status)) merged[platform] = status;
    }
    return merged;
}

function resolveResults({ requested, outcomes, env, build }, deps) {
    const results = {};
    for (const platform of requested) {
        const outcome = outcomes[platform] || 'skipped';
        if (outcome === 'success') results[platform] = 'uploaded';
        else if (outcome === 'failure' || outcome === 'cancelled') {
            let onStore = null;
            try {
                onStore = readStoreBuild(platform, env, deps);
            } catch (error) {
                deps.warn(`${error.message}. Counting ${platform} as failed; check the store by hand.`);
            }
            results[platform] = onStore === build ? 'incomplete' : 'failed';
        } else results[platform] = 'skipped';
    }
    return results;
}

const defaultDeps = {
    root: io.ROOT,
    tmpdir: () => os.tmpdir(),
    read: file => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null),
    remove: file => fs.rmSync(file, { force: true }),
    run: (command, args, env, cwd) => {
        const { spawnSync } = require('child_process');
        return spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } }).status;
    },
    warn: message => console.error(message),
};

module.exports = {
    STATUSES,
    storeBuildCommand,
    readStoreBuild,
    storeFloor,
    parseResults,
    formatResults,
    uploadedPlatforms,
    mergeResults,
    resolveResults,
    defaultDeps,
};
