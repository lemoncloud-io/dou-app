/**
 * Leaves the tree as the build found it. `pod install` rewrites `Podfile.lock` (an
 * environment-specific hermes-engine checksum), and the harness swaps the installed `Manifest.lock`
 * into it for the length of a build; neither is the developer's change, and an agent that commits
 * after a run would pick it up. `project.pbxproj` is guarded the same way because `pod install` can
 * rewrite it too.
 *
 * The guard snapshots those files' bytes before the build and writes the same bytes back as soon as
 * the build is done — not at the end of the run. While a scenario runs, or while `--app-only`
 * holds the app up for hand checks, the developer may be editing; anything changed then is theirs.
 * Writing back bytes instead of `git checkout` keeps a developer's own uncommitted edit to a guarded
 * file from before the run. The guard never deletes anything: files that appeared during the run
 * are reported, not removed.
 */
const fs = require('fs');
const path = require('path');

const { probe } = require('./proc');

const GUARDED_FILES = ['apps/mobile/ios/Podfile.lock', 'apps/mobile/ios/Chatic.xcodeproj/project.pbxproj'];

/** Paths from `git status --porcelain=v1 -z --untracked-files=all`, split by kind. */
function parseStatus(output) {
    const changed = new Set();
    const untracked = new Set();
    const entries = output.split('\0').filter(Boolean);
    for (let i = 0; i < entries.length; i++) {
        const code = entries[i].slice(0, 2);
        const file = entries[i].slice(3);
        if (code === '??') untracked.add(file);
        else changed.add(file);
        if (code[0] === 'R' || code[0] === 'C') i++; // the rename source follows as its own entry
    }
    return { changed, untracked };
}

function readStatus(root) {
    return parseStatus(probe('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root }).stdout);
}

function snapshot(root) {
    const files = new Map();
    for (const file of GUARDED_FILES) {
        const full = path.join(root, file);
        if (fs.existsSync(full)) files.set(file, fs.readFileSync(full));
    }
    return { files, status: readStatus(root) };
}

/** Write the guarded files back to their snapshot. Returns the ones that had changed. */
function restore(root, before) {
    const restored = [];
    for (const [file, bytes] of before.files) {
        const full = path.join(root, file);
        if (!fs.existsSync(full) || !fs.readFileSync(full).equals(bytes)) {
            fs.writeFileSync(full, bytes);
            restored.push(file);
        }
    }
    return restored;
}

/** Paths that changed or appeared since the snapshot, other than the guarded files. Report only. */
function changedSince(root, before) {
    const after = readStatus(root);
    return [...after.changed, ...after.untracked].filter(
        file => !before.status.changed.has(file) && !before.status.untracked.has(file) && !GUARDED_FILES.includes(file)
    );
}

module.exports = { GUARDED_FILES, parseStatus, snapshot, restore, changedSince };
