const HEADER = /^(\w+)(?:\(([^)]*)\))?(!)?:\s/;
const BREAKING_BODY = /^BREAKING[ -]CHANGE:/m;
const LEGACY_VERSION_BUMP = /^chore\(mobile\): bump (app versions|build number)\b/;

const CATEGORIES = [
    { key: 'breaking', title: 'Breaking', cardTitle: '호환성 변경', rank: 5 },
    { key: 'feat', title: 'Features', cardTitle: '새 기능', rank: 4 },
    { key: 'fix', title: 'Fixes', cardTitle: '수정', rank: 3 },
    { key: 'improve', title: 'Improvements', cardTitle: '개선', rank: 2 },
    { key: 'other', title: 'Other', cardTitle: '기타', rank: 1 },
];

const RANK = Object.fromEntries(CATEGORIES.map(category => [category.key, category.rank]));

function parseConventional(subject, body = '') {
    const match = HEADER.exec(subject || '');
    const type = match ? match[1].toLowerCase() : null;
    const breaking = Boolean(match && match[3]) || BREAKING_BODY.test(body || '');
    return { type, scope: match ? match[2] || null : null, breaking };
}

function categoryOf({ type, breaking }) {
    if (breaking) return 'breaking';
    if (type === 'feat') return 'feat';
    if (type === 'fix') return 'fix';
    if (type === 'perf' || type === 'refactor') return 'improve';
    return 'other';
}

function highestCategory(keys) {
    return keys.reduce((best, key) => (best === null || RANK[key] > RANK[best] ? key : best), null);
}

function isLegacyVersionBump(subject) {
    return LEGACY_VERSION_BUMP.test(subject || '');
}

function proposeUnit(commits, signals = []) {
    if (commits.length === 0) return { unit: null, reasons: [] };
    const breaking = commits.filter(commit => commit.breaking);
    if (breaking.length > 0) return { unit: 'major', reasons: breaking.map(commit => reason(commit, 'breaking')) };
    if (signals.length > 0) {
        return {
            unit: 'minor',
            reasons: signals.map(signal => ({
                sha: signal.sha,
                file: signal.file,
                detail: signal.detail,
                pr: signal.pr || null,
                why: 'native',
            })),
        };
    }
    const feats = commits.filter(commit => commit.type === 'feat');
    return { unit: 'patch', reasons: [], featCommits: feats.length };
}

function reason(commit, why) {
    return { sha: commit.sha, subject: commit.subject, pr: commit.pr ? commit.pr.number : null, why };
}

module.exports = {
    CATEGORIES,
    parseConventional,
    categoryOf,
    highestCategory,
    isLegacyVersionBump,
    proposeUnit,
};
