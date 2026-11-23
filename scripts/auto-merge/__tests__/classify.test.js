const test = require('node:test');
const assert = require('node:assert/strict');
const { classify } = require('../classify');
const { file, pr, fix } = require('./helpers');

const commentOnly = file('libs/runtime/src/a.ts', {
    before: '// why\nexport const a = 1;\n',
    after: 'export const a = 1;\n',
});
const smallSource = file('apps/web/src/a.ts', {
    before: 'export const a = 1;\n',
    after: 'export const a = 2;\n',
    additions: 1,
    deletions: 1,
});
const addedTest = file('apps/web/src/a.test.ts', { status: 'A', after: "it('a', () => {});\n" });

const run = (files, extra = {}) =>
    classify({ pr: pr(extra.pr), files, commits: extra.commits || [fix('fix(web): x')], signals: extra.signals || {} });

test('A1: a comment-only removal is eligible', () => {
    const r = run([commentOnly]);
    assert.equal(r.eligible, true);
    assert.deepEqual(r.classes, ['A1']);
});

test('A2: a lowered baseline is eligible; a raised one or a new entry is not', () => {
    const lowered = file('tools/ratchet/comments.json', { before: '{"a.ts": 3, "b.ts": 1}', after: '{"a.ts": 2}' });
    assert.deepEqual(run([lowered]).classes, ['A2']);
    const raised = file('tools/ratchet/comments.json', { before: '{"a.ts": 3}', after: '{"a.ts": 4}' });
    assert.match(run([raised]).proof.failed[0].why, /rose 3 → 4/);
    const added = file('tools/ratchet/comments.json', { before: '{"a.ts": 3}', after: '{"a.ts": 3, "b.ts": 1}' });
    assert.match(run([added]).proof.failed[0].why, /entry added/);
    const nested = file('tools/ratchet/comments.json', {
        before: '{"v":1,"files":{"a":2}}',
        after: '{"v":2,"files":{"a":1}}',
    });
    assert.match(run([nested]).proof.failed[0].why, /v rose/);
    const label = file('tools/ratchet/comments.json', { before: '{"rule":"x","n":2}', after: '{"rule":"y","n":2}' });
    assert.match(run([label]).proof.failed[0].why, /not a count/);
    const created = file('tools/ratchet/new.json', { status: 'A', after: '{}' });
    assert.equal(run([created]).eligible, false);
});

test('A3: added tests are eligible; dropped cases, deleted files and focus markers are not', () => {
    assert.deepEqual(run([addedTest], { commits: [{ subject: 'test(web): x', parents: 1 }] }).classes, ['A3']);
    const grown = file('libs/x/src/a.spec.ts', { before: "it('a', f);\n", after: "it('a', f);\nit('b', f);\n" });
    assert.equal(run([grown]).eligible, true);
    const dropped = file('libs/x/src/a.spec.ts', { before: "it('a', f);\nit('b', f);\n", after: "it('a', f);\n" });
    assert.match(run([dropped]).proof.failed[0].why, /dropped 2 → 1/);
    const skipped = file('libs/x/src/a.spec.ts', { before: "it('a', f);\n", after: "it('a', f);\nit.skip('b', f);\n" });
    assert.match(run([skipped]).proof.failed[0].why, /marker/);
    const deleted = file('libs/x/src/a.spec.ts', { status: 'D', before: "it('a', f);\n" });
    assert.match(run([deleted]).proof.failed[0].why, /deleted/);
    const fixture = file('apps/web-e2e/src/fixtures/rooms.json', { before: '[]', after: '[1]' });
    assert.equal(run([fixture]).eligible, true);
});

test('A4: module docs are eligible on their own and mixed with other proofs', () => {
    const doc = file('libs/runtime/README.md', { before: 'a\n', after: 'b\n' });
    assert.deepEqual(run([doc]).classes, ['A4']);
    assert.deepEqual(run([commentOnly, doc]).classes, ['A1', 'A4']);
});

test('a source change with no proof falls through to the small-fix rules', () => {
    const r = run([smallSource, addedTest]);
    assert.equal(r.eligible, true);
    assert.deepEqual(r.classes, ['B']);
    assert.equal(r.fix.lines, 2);
});

test('B: a non-fix commit fails, merge commits are ignored', () => {
    assert.match(
        run([smallSource, addedTest], { commits: [fix('fix(web): x'), { subject: 'feat(web): y', parents: 1 }] }).fix
            .fails[0],
        /not a `fix` commit/
    );
    assert.equal(
        run([smallSource, addedTest], { commits: [fix('fix: x'), { subject: "Merge branch 'develop'", parents: 2 }] })
            .eligible,
        true
    );
    assert.equal(run([smallSource, addedTest], { commits: [fix('fix(web)!: breaking')] }).eligible, false);
    assert.equal(run([smallSource, addedTest], { commits: [] }).eligible, false);
});

test('B: over 50 non-test lines fails, test lines do not count, doc lines do', () => {
    const big = file('apps/web/src/a.ts', { additions: 30, deletions: 21, before: 'x', after: 'y' });
    assert.match(run([big, addedTest]).fix.fails[0], /51 non-test lines/);
    const exact = file('apps/web/src/a.ts', { additions: 25, deletions: 25, before: 'x', after: 'y' });
    const bigTest = file('apps/web/src/b.test.ts', { status: 'A', after: "it('a', f);\n", additions: 400 });
    assert.equal(run([exact, bigTest]).eligible, true);
    const doc = file('apps/web/README.md', { additions: 1, deletions: 0, before: 'a', after: 'b' });
    assert.equal(run([exact, doc, bigTest]).eligible, false);
});

test('B: non-test files in two projects or at the root fail', () => {
    const other = file('libs/runtime/src/b.ts', { additions: 1, deletions: 1, before: 'x', after: 'y' });
    assert.match(run([smallSource, other, addedTest]).fix.fails.join(), /span 2 projects/);
    const root = file('tools/release-notes.js', { additions: 1, deletions: 1, before: 'x', after: 'y' });
    assert.match(run([smallSource, root, addedTest]).fix.fails.join(), /repository root/);
    const e2e = file('apps/web-e2e/src/a.spec.ts', { status: 'A', after: "test('a', f);\n" });
    assert.equal(run([smallSource, e2e]).eligible, true, 'a test in another project is fine');
});

test('B: a fix without a test change, or one that drops test cases, fails', () => {
    assert.match(run([smallSource]).fix.fails.join(), /no test file changed/);
    const dropped = file('apps/web/src/a.test.ts', { before: "it('a', f);\nit('b', f);\n", after: "it('a', f);\n" });
    assert.match(run([smallSource, dropped]).fix.fails.join(), /dropped/);
});

test('gates: label, draft, fork, base branch, visual regression and empty diff block before any rule', () => {
    const blocked = [
        [{ pr: { labels: ['no-auto-merge'] } }, /no-auto-merge/],
        [{ pr: { draft: true } }, /draft/],
        [{ pr: { isFork: true } }, /fork/],
        [{ pr: { baseRef: 'main' } }, /base branch/],
        [{ signals: { visualRegression: 'failure' } }, /visual regression/],
    ];
    for (const [extra, re] of blocked) {
        const r = run([commentOnly], extra);
        assert.equal(r.eligible, false);
        assert.match(r.blocks.join(), re);
    }
    assert.equal(run([commentOnly], { signals: { visualRegression: 'missing' } }).eligible, true);
    assert.match(run([]).blocks.join(), /empty/);
});

test('gates: an excluded path or a binary file blocks even an otherwise provable change', () => {
    const adr = file('docs/adr/0400-x.md', { status: 'A', after: '# x\n' });
    assert.match(run([commentOnly, adr]).blocks.join(), /ADR/);
    const lock = file('yarn.lock', { before: 'a', after: 'b' });
    assert.match(run([smallSource, addedTest, lock]).blocks.join(), /dependencies/);
    const image = file('apps/web/src/assets/logo.png', { binary: true });
    assert.match(run([image]).blocks.join(), /binary/);
});

test('a file type outside every proof class is not provable', () => {
    const css = file('apps/web/src/a.css', { before: 'a{}', after: 'b{}', additions: 1, deletions: 1 });
    const r = run([css]);
    assert.equal(r.eligible, false);
    assert.match(r.proof.failed[0].why, /no proof class/);
});

test('an added or deleted source file is never a comment-only change', () => {
    const added = file('apps/web/src/new.ts', { status: 'A', after: 'export {};\n' });
    assert.match(
        run([added], { commits: [{ subject: 'feat: x', parents: 1 }] }).proof.failed[0].why,
        /added or deleted/
    );
});

test('a ratchet baseline under tools/eslint-rules is provable, the rest of that directory is not', () => {
    const baseline = file('tools/eslint-rules/ratchet-baseline.json', {
        before: '{"apps/web/src/a.ts": {"comments": 41, "asAny": 2}, "apps/web/src/b.ts": {"comments": 3}}',
        after: '{"apps/web/src/a.ts": {"comments": 40}}',
    });
    assert.deepEqual(run([baseline]).classes, ['A2']);
    const rule = file('tools/eslint-rules/no-comments.js', { before: 'a', after: 'b' });
    assert.match(run([baseline, rule]).blocks.join(), /lint rules\) is always reviewed/);
    const elsewhere = file('.github/ratchet-baseline.json', { before: '{"a": 2}', after: '{"a": 1}' });
    assert.match(run([elsewhere]).blocks.join(), /GitHub workflows/);
    const renamed = file('tools/eslint-rules/ratchet-baseline.json', {
        before: '{"apps/web/src/a.ts": {"comments": 4}}',
        after: '{"apps/web/src/c.ts": {"comments": 4}}',
    });
    assert.match(run([renamed]).proof.failed[0].why, /entry added/);
});

test('review fixes: control characters, type changes, repo scripts, nested agent folders, pending visual check', () => {
    const tabbed = file('apps/w.md\t.html', { status: 'A', after: '<script></script>' });
    assert.match(run([tabbed]).blocks.join(), /control character/);
    const link = file('apps/web/README.md', { status: 'T', before: 'a', after: '../x' });
    assert.match(run([link]).blocks.join(), /changed type/);
    const gate = file('scripts/check-code-korean.js', { before: 'a', after: 'b' });
    assert.match(run([gate]).blocks.join(), /repository scripts CI runs/);
    const scriptTest = file('scripts/__tests__/check-env.test.js', { status: 'A', after: "test('a', f);\n" });
    assert.equal(run([scriptTest]).eligible, true);
    const nested = file('apps/web/.claude/skills/x.md', { status: 'A', after: '# x\n' });
    assert.match(run([nested]).blocks.join(), /agent settings/);
    assert.match(
        run([file('libs/x/README.md', { before: 'a', after: 'b' })], {
            signals: { visualRegression: 'pending' },
        }).blocks.join(),
        /not finished/
    );
});

test('untrusted text cannot break out of code spans in the reasons', () => {
    const odd = file('apps/web/src/a`@team|x.css', { before: 'a', after: 'b' });
    const r = run([odd], { commits: [{ subject: 'feat: `@everyone` | x', parents: 1 }] });
    const text = [...r.proof.failed.map(p => p.path), ...r.fix.fails].join('\n');
    assert.doesNotMatch(r.fix.fails.join(), /`@everyone`/);
    assert.match(r.fix.fails.join(), /@\u200beveryone/);
    assert.ok(text.length > 0);
});

test('ratchet baselines under scripts/ratchet are provable; the judge and its modes are always reviewed', () => {
    const baseline = file('scripts/ratchet/source-ratchet-baseline.json', {
        before: '{"apps/web/src/a.ts": {"comments": 41}}',
        after: '{"apps/web/src/a.ts": {"comments": 39}}',
    });
    assert.deepEqual(run([baseline]).classes, ['A2']);
    for (const path of ['scripts/ratchet/modes.json', 'scripts/ratchet.js', 'scripts/ratchet/judge.js']) {
        const judge = file(path, { before: '{"a": "enforce"}', after: '{"a": "observe"}' });
        assert.match(run([judge]).blocks.join(), /repository scripts CI runs\) is always reviewed/, path);
    }
});
