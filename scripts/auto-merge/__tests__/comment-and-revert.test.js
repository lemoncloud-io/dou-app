const test = require('node:test');
const assert = require('node:assert/strict');
const { classify } = require('../classify');
const { render, MARKER } = require('../comment');
const { revertTargets, renderIssue } = require('../revert');
const { file, pr, fix } = require('./helpers');

const commentOnly = file('libs/runtime/src/a.ts', {
    before: '// why\nexport const a = 1;\n',
    after: 'export const a = 1;\n',
});

test('the comment carries the marker, the verdict, the head and the action', () => {
    const r = classify({ pr: pr(), files: [commentOnly], commits: [fix('fix: x')] });
    const body = render(r, { headSha: 'abcdef1234', action: 'enabled', runUrl: 'https://run' });
    assert.ok(body.startsWith(MARKER));
    assert.match(body, /\*\*Eligible\*\* for `abcdef1`: \*\*A1\*\* comments removed only/);
    assert.match(body, /Auto-merge is on/);
    assert.match(body, /`libs\/runtime\/src\/a.ts` \| A1 \| proven/);
    assert.match(body, /\[Run\]\(https:\/\/run\)/);
});

test('the comment names the setup gap when auto-merge cannot be turned on', () => {
    const r = classify({ pr: pr(), files: [commentOnly], commits: [] });
    assert.match(render(r, { action: 'no-required-checks' }), /no ruleset requiring/);
    assert.match(render(r, { action: 'no-token' }), /AUTO_MERGE_TOKEN/);
});

test('an ineligible comment lists both the failed proofs and the failed fix rules', () => {
    const src = file('apps/web/src/a.ts', { before: 'export const a = 1;\n', after: 'export const a = 2;\n' });
    const r = classify({ pr: pr(), files: [src], commits: [{ subject: 'feat(web): x', parents: 1 }] });
    const body = render(r, { action: 'not-eligible' });
    assert.match(body, /\*\*Not eligible\*\*/);
    assert.match(body, /code changed, not only comments/);
    assert.match(body, /not a `fix` commit/);
    assert.match(body, /no test file changed/);
});

test('a blocked comment lists only the blocks', () => {
    const r = classify({ pr: pr({ labels: ['no-auto-merge'] }), files: [commentOnly], commits: [] });
    const body = render(r, { action: 'not-eligible' });
    assert.match(body, /Stopped by:\n- the `no-auto-merge` label is set/);
    assert.doesNotMatch(body, /Not a small fix/);
});

test('a small-fix comment states the line count and the project', () => {
    const src = file('apps/web/src/a.ts', { before: 'export const a = 1;\n', after: 'export const a = 2;\n' });
    const t = file('apps/web/src/a.test.ts', { status: 'A', after: "it('a', f);\n" });
    const body = render(classify({ pr: pr(), files: [src, t], commits: [fix('fix: x')] }), { action: 'enabled' });
    assert.match(body, /2 non-test lines \(limit 50\) in `apps\/web`/);
});

test('revert targets come from the GitHub revert body, revert commits and the title', () => {
    assert.deepEqual(revertTargets({ title: 'Revert "[Web] add x"', body: 'Reverts lemoncloud-io/dou-app#1120' }), {
        numbers: [1120],
        shas: [],
        revertedTitle: '[Web] add x',
    });
    const t = revertTargets({
        title: 'Revert the room list change',
        body: '',
        commitMessages: ['Revert "x"\n\nThis reverts commit 0123456789abcdef0123456789abcdef01234567.'],
    });
    assert.deepEqual(t.shas, ['0123456789abcdef0123456789abcdef01234567']);
    assert.equal(t.revertedTitle, null);
    assert.deepEqual(revertTargets({ title: 'Revert x', body: 'Reverts #12 and Reverts #13' }).numbers, [12, 13]);
});

test('the ratchet issue flags an auto-merged original', () => {
    const auto = renderIssue({
        revert: { number: 9 },
        original: { number: 5, title: 'x', labels: ['auto-merge:eligible'] },
    });
    assert.match(auto, /#9 reverted #5 \(`x`\)/);
    assert.match(auto, /Auto-merged: \*\*yes\*\*/);
    assert.match(
        renderIssue({ revert: { number: 9 }, original: { number: 5, title: 'x', labels: [] } }),
        /Auto-merged: no/
    );
    assert.match(renderIssue({ revert: { number: 9 }, original: null }), /could not be found/);
});

test('observe mode says it would auto-merge and turned nothing on', () => {
    const r = classify({ pr: pr(), files: [commentOnly], commits: [] });
    assert.match(render(r, { action: 'observe' }), /\*\*would auto-merge\*\*.*Nothing was turned on/);
});

test('an ineligible comment says what would make it eligible', () => {
    const src = file('apps/web/src/a.ts', { before: 'export const a = 1;\n', after: 'export const a = 2;\n' });
    const r = classify({ pr: pr(), files: [src], commits: [{ subject: 'feat(web): x', parents: 1 }] });
    const body = render(r, { action: 'not-eligible' });
    assert.match(body, /To make it eligible:\n- For a small fix, make every commit a `fix:` commit/);
    assert.match(body, /add or extend a test that fails without the fix/);
    assert.doesNotMatch(body, /comment cleanup/, 'a feature change gets no comment-cleanup hint');
    const blocked = classify({ pr: pr({ draft: true }), files: [commentOnly], commits: [] });
    assert.match(
        render(blocked, { action: 'not-eligible' }),
        /To make it eligible:\n- Mark the pull request ready for review\./
    );
    const eligible = classify({ pr: pr(), files: [commentOnly], commits: [] });
    assert.doesNotMatch(render(eligible, { action: 'observe' }), /To make it eligible/);
});

test('the ratchet issue proposes a candidate rule and asks for an adversarial check first', () => {
    const body = renderIssue({
        revert: { number: 9 },
        original: { number: 5, title: 'x', labels: [], files: ['apps/web/src/a.ts', 'apps/web/src/a.test.ts'] },
    });
    assert.match(body, /\*\*Candidate rule:\*\* A test in `apps\/web` that fails on the reverted change/);
    assert.match(body, /- \[ \] \*\*Adversarial check\.\*\*.*counterexample/);
    assert.match(body, /- \[ \] A person approves the rule/);
    const auto = renderIssue({
        revert: { number: 9 },
        original: { number: 5, title: 'x', labels: ['auto-merge:eligible'], files: [] },
    });
    assert.match(auto, /Tighten the auto-merge class #5 passed/);
});
