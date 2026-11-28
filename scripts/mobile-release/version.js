const TAG_PREFIX = 'mobile-v';
const TAG = /^mobile-v(\d+\.\d+\.\d+)-(\d+)$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const UNITS = ['major', 'minor', 'patch'];
const RELEASE_BRANCH = /^release\/mobile-(\d+)\.(\d+)$/;

function releaseBranchFor(version) {
    const [major, minor] = version.split('.');
    return `release/mobile-${major}.${minor}`;
}

function parseReleaseBranch(name) {
    const match = RELEASE_BRANCH.exec(name || '');
    return match ? { name, major: Number(match[1]), minor: Number(match[2]) } : null;
}

function parseTag(name) {
    const match = TAG.exec(name || '');
    return match ? { name, version: match[1], build: Number(match[2]) } : null;
}

function tagName(version, build) {
    return `${TAG_PREFIX}${version}-${build}`;
}

function compareVersions(a, b) {
    const left = a.split('.').map(Number);
    const right = b.split('.').map(Number);
    for (let i = 0; i < 3; i += 1) {
        if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
    }
    return 0;
}

function bumpVersion(version, unit) {
    const [major, minor, patch] = version.split('.').map(Number);
    if (unit === 'major') return `${major + 1}.0.0`;
    if (unit === 'minor') return `${major}.${minor + 1}.0`;
    if (unit === 'patch') return `${major}.${minor}.${patch + 1}`;
    throw new Error(`Unknown bump unit: ${unit}`);
}

function nextBuildNumber(tags, floor) {
    const highest = tags
        .map(parseTag)
        .filter(Boolean)
        .reduce((max, tag) => Math.max(max, tag.build), floor);
    return highest + 1;
}

function latestTag(tags) {
    return tags
        .map(parseTag)
        .filter(Boolean)
        .reduce((best, tag) => (best === null || tag.build > best.build ? tag : best), null);
}

function resolveUnit(proposed, requested = 'auto') {
    if (requested && requested !== 'auto') {
        if (!UNITS.includes(requested)) throw new Error(`bump must be auto, major, minor or patch (got ${requested})`);
        return requested;
    }
    if (proposed === 'major') return 'minor';
    return proposed || 'patch';
}

function resolveVersion({ base, unit, devTags = [], requested }) {
    if (requested) {
        if (!SEMVER.test(requested)) throw new Error(`version must be X.Y.Z (got ${requested})`);
        if (compareVersions(requested, base) <= 0) {
            throw new Error(`version ${requested} must be higher than the last prod version ${base}`);
        }
        return requested;
    }
    const bumped = bumpVersion(base, unit);
    return devTags
        .map(parseTag)
        .filter(Boolean)
        .map(tag => tag.version)
        .reduce((max, version) => (compareVersions(version, max) > 0 ? version : max), bumped);
}

module.exports = {
    TAG_PREFIX,
    UNITS,
    releaseBranchFor,
    parseReleaseBranch,
    parseTag,
    tagName,
    compareVersions,
    bumpVersion,
    nextBuildNumber,
    latestTag,
    resolveUnit,
    resolveVersion,
};
