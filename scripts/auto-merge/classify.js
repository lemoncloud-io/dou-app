const rules = require('./rules');
const { proveCommentRemoval, countTests } = require('./ast');
const { code } = require('./text');

const FIX_LINE_LIMIT = 50;
const FIX_SUBJECT = /^fix(\([^)]*\))?: \S/;
const BLOCKING_LABEL = 'no-auto-merge';
const BASE_BRANCH = 'develop';

const CLASS_NAMES = {
    A1: 'comments removed only',
    A2: 'ratchet baseline lowered only',
    A3: 'tests added only',
    A4: 'module docs only',
    B: 'small fix',
};

function numericLowered(before, after, at) {
    if (typeof before === 'number' && typeof after === 'number') {
        return after <= before ? null : `${at || 'value'} rose ${before} → ${after}`;
    }
    if (
        before &&
        after &&
        typeof before === 'object' &&
        typeof after === 'object' &&
        Array.isArray(before) === Array.isArray(after)
    ) {
        for (const key of Object.keys(after)) {
            if (!(key in before)) return `entry added: ${at ? `${at}.` : ''}${key}`;
            const why = numericLowered(before[key], after[key], at ? `${at}.${key}` : key);
            if (why) return why;
        }
        return null;
    }
    return JSON.stringify(before) === JSON.stringify(after) ? null : `${at || 'value'} changed and is not a count`;
}

function proveBaseline(file) {
    if (file.status !== 'M') return { ok: false, why: 'a baseline file was added or deleted' };
    let before;
    let after;
    try {
        before = JSON.parse(file.before());
        after = JSON.parse(file.after());
    } catch {
        return { ok: false, why: 'baseline is not valid JSON' };
    }
    const why = numericLowered(before, after, '');
    return why ? { ok: false, why } : { ok: true };
}

function proveTestsGrow(file) {
    if (file.status === 'D') return { ok: false, why: 'a test file was deleted' };
    if (!rules.isSourceFile(file.path)) return { ok: true };
    const after = countTests(file.path, file.after());
    if (!after.parses) return { ok: false, why: 'test file does not parse' };
    const before = file.status === 'A' ? { cases: 0, markers: 0 } : countTests(file.path, file.before());
    if (after.cases < before.cases) return { ok: false, why: `test cases dropped ${before.cases} → ${after.cases}` };
    if (after.markers > before.markers) return { ok: false, why: 'a .only / .skip / xit marker was added' };
    return { ok: true, added: after.cases - before.cases };
}

function proofFor(file, baselines) {
    if (rules.isTestFile(file.path)) return { cls: 'A3', ...proveTestsGrow(file) };
    if (rules.isModuleDoc(file.path)) return { cls: 'A4', ok: true };
    if (rules.isBaseline(file.path, baselines)) return { cls: 'A2', ...proveBaseline(file) };
    if (rules.isSourceFile(file.path)) {
        if (file.status !== 'M') return { cls: 'A1', ok: false, why: 'a source file was added or deleted' };
        return { cls: 'A1', ...proveCommentRemoval(file.path, file.before(), file.after()) };
    }
    return { cls: null, ok: false, why: 'no proof class covers this file type' };
}

const BASELINE_MAY_LIVE_IN = new Set(['lint rules']);

function gates(input, baselines) {
    const blocks = [];
    const { pr = {}, files = [], signals = {} } = input;
    if ((pr.labels || []).includes(BLOCKING_LABEL)) blocks.push(`the \`${BLOCKING_LABEL}\` label is set`);
    if (pr.draft) blocks.push('the pull request is a draft');
    if (pr.isFork) blocks.push('the pull request comes from a fork');
    if (pr.baseRef && pr.baseRef !== BASE_BRANCH) {
        blocks.push(`the base branch is ${code(pr.baseRef)}, not \`${BASE_BRANCH}\``);
    }
    if (signals.visualRegression === 'pending') {
        blocks.push('the visual regression check has not finished; the verdict is taken again when verify completes');
    }
    if (signals.visualRegression === 'failure') {
        blocks.push('the visual regression check reports a screenshot difference');
    }
    if (files.length === 0) blocks.push('the diff is empty');
    for (const file of files) {
        const label = rules.excludedBy(file.path);
        const baselineHome = label && BASELINE_MAY_LIVE_IN.has(label) && rules.isBaseline(file.path, baselines);
        if (label && !baselineHome) blocks.push(`${code(file.path)} (${label}) is always reviewed`);
        else if (file.binary) blocks.push(`${code(file.path)} is a binary file`);
        else if (file.status === 'T') blocks.push(`${code(file.path)} changed type (a file became a link or back)`);
        const control = [...file.path].some(ch => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127);
        if (control) blocks.push('a path contains a control character');
    }
    return blocks;
}

function tryProof(files, baselines) {
    const proofs = files.map(file => ({ path: file.path, ...proofFor(file, baselines) }));
    const failed = proofs.filter(p => !p.ok);
    const classes = [...new Set(proofs.map(p => p.cls))].filter(Boolean).sort();
    return { ok: failed.length === 0, proofs, failed, classes };
}

function trySmallFix(files, commits) {
    const fails = [];
    const own = commits.filter(c => (c.parents || 1) < 2);
    if (own.length === 0) fails.push('no commits to check');
    const offType = own.find(c => !FIX_SUBJECT.test(c.subject));
    if (offType) fails.push(`commit ${code(offType.subject.slice(0, 72))} is not a \`fix\` commit`);

    const tests = files.filter(f => rules.isTestFile(f.path));
    const rest = files.filter(f => !rules.isTestFile(f.path));
    const lines = rest.reduce((n, f) => n + f.additions + f.deletions, 0);
    if (lines > FIX_LINE_LIMIT) fails.push(`${lines} non-test lines changed, over the ${FIX_LINE_LIMIT}-line limit`);

    const projects = new Set(rest.map(f => rules.projectOf(f.path) || '(repository root)'));
    if (projects.size > 1) {
        fails.push(`non-test files span ${projects.size} projects: ${[...projects].map(code).join(', ')}`);
    }

    if (tests.length === 0) fails.push('no test file changed');
    for (const t of tests) {
        const proof = proveTestsGrow(t);
        if (!proof.ok) fails.push(`${code(t.path)}: ${proof.why}`);
    }
    return { ok: fails.length === 0, fails, lines, projects: [...projects] };
}

/**
 * Decides whether a pull request may merge without another reviewer.
 *
 * input.files: [{ path, status: 'A'|'M'|'D', additions, deletions, binary, before(), after() }]
 * input.commits: [{ subject, parents }]
 * input.pr: { labels, draft, isFork, baseRef }
 * input.signals: { visualRegression: 'success'|'failure'|'pending'|'missing' }
 */
function classify(input) {
    const files = input.files || [];
    const commits = input.commits || [];
    const baselines = input.baselines || rules.baselinePatterns();
    const blocks = gates(input, baselines);
    if (blocks.length) return { eligible: false, classes: [], blocks, proof: null, fix: null };

    const proof = tryProof(files, baselines);
    if (proof.ok) return { eligible: true, classes: proof.classes, blocks: [], proof, fix: null };

    const fix = trySmallFix(files, commits);
    if (fix.ok) return { eligible: true, classes: ['B'], blocks: [], proof, fix };
    return { eligible: false, classes: [], blocks: [], proof, fix };
}

module.exports = { classify, CLASS_NAMES, FIX_LINE_LIMIT, BLOCKING_LABEL };
