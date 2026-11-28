const fs = require('fs');
const path = require('path');

const io = require('./io');

const UTF8_LOCALE = { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
const SIGNAL_EXIT = { SIGINT: 130, SIGTERM: 143 };

const DRY_RUN_STEP =
    'ios: pod install (UTF-8 locale) when Pods are missing or out of date, Pods/Manifest.lock in place of ' +
    'Podfile.lock for the build; Podfile.lock and project.pbxproj written back to their committed bytes afterwards';

async function withIosPods(upload, deps) {
    const before = deps.treeGuard.snapshot(deps.root);
    let restored = false;
    const restore = () => {
        if (restored) return;
        restored = true;
        const files = deps.treeGuard.restore(deps.root, before);
        if (files.length) deps.log(`Restored what the iOS build rewrote: ${files.join(', ')}`);
    };
    const handlers = {};
    for (const [signal, code] of Object.entries(SIGNAL_EXIT)) {
        handlers[signal] = () => {
            restore();
            deps.exit(code);
        };
        deps.signals.on(signal, handlers[signal]);
    }
    try {
        try {
            await deps.ensurePods();
        } catch (error) {
            const hint = (error.fix || []).find(step => step.startsWith('Read '));
            return { status: null, error: `ios pods not ready (${error.message}${hint ? ` ${hint}` : ''})` };
        }
        return { status: upload() };
    } finally {
        restore();
        for (const [signal, handler] of Object.entries(handlers)) deps.signals.off(signal, handler);
        const changed = deps.treeGuard.changedSince(deps.root, before);
        if (changed.length) deps.log(`Changed in the tree during the iOS upload (left as is): ${changed.join(', ')}`);
    }
}

function ensurePodsForRelease(root, log) {
    const { ensurePods } = require('../mobile-verify/ios');
    const { stateDirFor } = require('../mobile-verify/checkout');
    const stateDir = stateDirFor(root);
    fs.mkdirSync(stateDir, { recursive: true });
    const stateFile = path.join(stateDir, 'release-pods.json');
    const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
    const logFile = path.join(stateDir, 'release-pod-install.log');
    return ensurePods({ root, env: { ...process.env, ...UTF8_LOCALE }, state, logFile, log }).then(() =>
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2))
    );
}

const defaultDeps = {
    root: io.ROOT,
    treeGuard: require('../mobile-verify/treeGuard'),
    ensurePods: () => ensurePodsForRelease(io.ROOT, message => console.log(message)),
    signals: process,
    exit: code => process.exit(code),
    log: message => console.log(message),
};

module.exports = { UTF8_LOCALE, DRY_RUN_STEP, withIosPods, ensurePodsForRelease, defaultDeps };
