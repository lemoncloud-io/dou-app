const MOBILE_ROOT = 'apps/mobile';
const MOBILE_PACKAGE_JSON = 'apps/mobile/package.json';
const PODFILE_LOCK = 'apps/mobile/ios/Podfile.lock';
const ANDROID_MANIFEST = /^apps\/mobile\/android\/app\/src\/main\/AndroidManifest\.xml$/;
const INFO_PLIST = /^apps\/mobile\/ios\/[^/]+\/Info\.plist$/;
const NATIVE_SOURCE = [/^apps\/mobile\/ios\/.+\.(m|mm|swift)$/, /^apps\/mobile\/android\/.+Package\.kt$/];

const NOT_IN_BINARY = [
    /\.md$/i,
    /(^|\/)docs\//,
    /(^|\/)__tests__\//,
    /(^|\/)__mocks__\//,
    /(^|\/)src\/test\//,
    /\.(test|spec)\.[cm]?[jt]sx?$/,
    /\.stories\.[jt]sx?$/,
    /^apps\/mobile\/e2e\//,
    /^apps\/mobile\/fastlane\//,
    /(^|\/)project\.json$/,
    /(^|\/)jest\.config\.[cm]?[jt]s$/,
    /(^|\/)eslint\.config\.[cm]?[jt]s$/,
    /(^|\/)\.eslintrc[^/]*$/,
    /(^|\/)tsconfig\.spec\.json$/,
    /(^|\/)\.gitignore$/,
];

function mobileDependencyRoots(graph, projectRoot = MOBILE_ROOT) {
    const nodes = graph.nodes || {};
    const start = Object.keys(nodes).find(name => nodes[name].data && nodes[name].data.root === projectRoot);
    if (!start) throw new Error(`No nx project with root ${projectRoot} in the project graph`);
    const seen = new Set();
    const stack = [start];
    while (stack.length > 0) {
        const name = stack.pop();
        for (const edge of graph.dependencies[name] || []) {
            if (nodes[edge.target] && !seen.has(edge.target)) {
                seen.add(edge.target);
                stack.push(edge.target);
            }
        }
    }
    return [...seen].map(name => nodes[name].data.root).sort();
}

function allProjectRoots(graph) {
    return Object.values(graph.nodes || {})
        .map(node => node.data && node.data.root)
        .filter(root => typeof root === 'string' && root !== '' && root !== '.')
        .sort();
}

function binaryRoots(libRoots) {
    return [MOBILE_ROOT, ...libRoots].map(root => root.replace(/\/+$/, '') + '/');
}

function reachesBinary(file, roots, otherRoots = []) {
    const deepest = (list, owned) =>
        list
            .map(root => root.replace(/\/+$/, '') + '/')
            .filter(root => file.startsWith(root))
            .map(root => ({ root, owned }));
    const owner = [...deepest(roots, true), ...deepest(otherRoots, false)].sort(
        (a, b) => b.root.length - a.root.length || Number(b.owned) - Number(a.owned)
    )[0];
    if (!owner || !owner.owned) return false;
    return isInBinaryFile(file);
}

function isInBinaryFile(file) {
    return !NOT_IN_BINARY.some(pattern => pattern.test(file));
}

function isNativeSource(file) {
    return NATIVE_SOURCE.some(pattern => pattern.test(file)) && isInBinaryFile(file);
}

function isPermissionFile(file) {
    return ANDROID_MANIFEST.test(file) || INFO_PLIST.test(file);
}

function permissions(text) {
    const found = new Set();
    for (const match of (text || '').matchAll(/<uses-permission(?:-sdk-\d+)?\b[^>]*android:name="([^"]+)"/g)) {
        found.add(match[1]);
    }
    for (const match of (text || '').matchAll(/<key>([A-Za-z0-9]+UsageDescription)<\/key>/g)) found.add(match[1]);
    return found;
}

function addedPermissions(before, after) {
    const old = permissions(before);
    return [...permissions(after)].filter(name => !old.has(name));
}

function addedDependencies(beforeJson, afterJson) {
    const parse = text => {
        try {
            return JSON.parse(text || '{}').dependencies || {};
        } catch {
            return {};
        }
    };
    const before = parse(beforeJson);
    return Object.keys(parse(afterJson)).filter(name => !(name in before));
}

module.exports = {
    MOBILE_ROOT,
    MOBILE_PACKAGE_JSON,
    PODFILE_LOCK,
    mobileDependencyRoots,
    allProjectRoots,
    binaryRoots,
    reachesBinary,
    isNativeSource,
    isPermissionFile,
    addedPermissions,
    addedDependencies,
};
