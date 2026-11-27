const {
    MOBILE_PACKAGE_JSON,
    PODFILE_LOCK,
    isNativeSource,
    isPermissionFile,
    addedPermissions,
    addedDependencies,
} = require('./paths');

const NATIVE_PATHS = ['apps/mobile/ios', 'apps/mobile/android', MOBILE_PACKAGE_JSON];

function changedFiles(deps, from, to) {
    return deps
        .git(['diff', '--name-status', '--no-renames', from, to, '--', ...NATIVE_PATHS])
        .split('\n')
        .filter(Boolean)
        .map(line => {
            const [status, file] = line.split('\t');
            return { status: status[0], file };
        });
}

function lastCommitFor(deps, from, to, file, added) {
    const args = ['log', '-1', '--format=%H'];
    if (added) args.push('--diff-filter=A');
    return deps.git([...args, `${from}..${to}`, '--', file]) || null;
}

function nativeSignals(deps, from, to) {
    const files = changedFiles(deps, from, to);
    const show = (ref, file) => deps.tryGit(['show', `${ref}:${file}`]) || '';
    const signals = [];
    const add = (kind, file, detail, added = false) =>
        signals.push({ kind, file, detail, sha: lastCommitFor(deps, from, to, file, added) });

    for (const { status, file } of files) {
        if (status === 'A' && isNativeSource(file)) add('native-source', file, 'new native source file', true);
    }
    if (files.some(item => item.file === MOBILE_PACKAGE_JSON)) {
        const names = addedDependencies(show(from, MOBILE_PACKAGE_JSON), show(to, MOBILE_PACKAGE_JSON));
        if (names.length > 0) add('dependency', MOBILE_PACKAGE_JSON, `new dependency ${names.join(', ')}`);
    }
    if (files.some(item => item.file === PODFILE_LOCK)) add('podfile-lock', PODFILE_LOCK, 'Podfile.lock changed');
    for (const { status, file } of files.filter(item => isPermissionFile(item.file))) {
        if (status === 'D') continue;
        const names = addedPermissions(status === 'A' ? '' : show(from, file), show(to, file));
        if (names.length > 0) add('permission', file, `new permission ${names.join(', ')}`);
    }
    return signals;
}

module.exports = { nativeSignals };
