const fs = require('fs');
const path = require('path');

const FLOWS_DIR = 'apps/mobile/e2e/flows';
const WEB_FEATURES_DIR = 'apps/web/src/app/features';

/**
 * Folders that start with `_` hold sub-flows other scenarios include (sign-in, onboarding); they are
 * not features and are never run on their own.
 */
const isSharedDir = name => name.startsWith('_');

/**
 * Every scenario under the flows folder, as { id: 'feature/scenario', feature, name, file, tags }.
 * `adapter.flowExtension` decides which files count; `adapter.readMeta` reads their tags.
 */
function listScenarios(root, adapter) {
    const flowsRoot = path.join(root, FLOWS_DIR);
    if (!fs.existsSync(flowsRoot)) return [];
    const scenarios = [];
    for (const feature of fs.readdirSync(flowsRoot).sort()) {
        const featureDir = path.join(flowsRoot, feature);
        if (isSharedDir(feature) || !fs.statSync(featureDir).isDirectory()) continue;
        for (const file of fs.readdirSync(featureDir).sort()) {
            if (!file.endsWith(adapter.flowExtension)) continue;
            const name = file.slice(0, -adapter.flowExtension.length);
            const fullPath = path.join(featureDir, file);
            const meta = adapter.readMeta(fs.readFileSync(fullPath, 'utf8'));
            scenarios.push({ id: `${feature}/${name}`, feature, name, file: fullPath, tags: meta.tags });
        }
    }
    return scenarios;
}

/**
 * Pick what a run covers. A `feature` target runs every scenario in it, `feature/scenario` one,
 * `--tag` every scenario carrying the tag. An empty selection is an invocation problem, reported
 * with what does exist so the caller can correct the name.
 */
function selectScenarios(scenarios, { target, tag }) {
    let selected;
    if (tag) {
        selected = scenarios.filter(s => s.tags.includes(tag));
    } else if (target.includes('/')) {
        selected = scenarios.filter(s => s.id === target);
    } else {
        selected = scenarios.filter(s => s.feature === target);
    }
    if (selected.length === 0) {
        const known = scenarios.map(s => s.id).join(', ') || '(none yet)';
        const what = tag ? `tagged "${tag}"` : `matching "${target}"`;
        throw new Error(`No scenario ${what}. Known scenarios: ${known}`);
    }
    return selected;
}

/**
 * Feature folders that do not name a web feature. The folder name is the link between a change
 * and its scenario ("you changed features/home, run the home scenarios"), so a typo silently
 * breaks it; the check keeps the two trees in step.
 */
function findUnknownFeatures(root) {
    const flowsRoot = path.join(root, FLOWS_DIR);
    if (!fs.existsSync(flowsRoot)) return [];
    const features = new Set(fs.readdirSync(path.join(root, WEB_FEATURES_DIR)));
    return fs
        .readdirSync(flowsRoot)
        .filter(name => !isSharedDir(name) && fs.statSync(path.join(flowsRoot, name)).isDirectory())
        .filter(name => !features.has(name));
}

module.exports = { FLOWS_DIR, WEB_FEATURES_DIR, listScenarios, selectScenarios, findUnknownFeatures };
