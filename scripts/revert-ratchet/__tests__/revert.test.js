const test = require('node:test');
const assert = require('node:assert/strict');
const { revertTargets, renderIssue } = require('../revert');

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

test('the ratchet issue proposes a candidate rule and asks for an adversarial check first', () => {
    const body = renderIssue({
        revert: { number: 9 },
        original: { number: 5, title: 'x', labels: [], files: ['apps/web/src/a.ts', 'apps/web/src/a.test.ts'] },
    });
    assert.match(body, /#9 reverted #5 \(`x`\)/);
    assert.match(body, /\*\*Candidate rule:\*\* A test in `apps\/web` that fails on the reverted change/);
    assert.match(body, /- \[ \] \*\*Adversarial check\.\*\*.*counterexample/);
    assert.match(body, /- \[ \] A person approves the rule/);
    assert.doesNotMatch(body, /auto-merge/i);
});

test('a missing original still gives an actionable issue, and titles cannot break out of code spans', () => {
    assert.match(renderIssue({ revert: { number: 9 }, original: null }), /could not be found/);
    const odd = renderIssue({ revert: { number: 9 }, original: { number: 5, title: '`@team` | x', files: [] } });
    assert.match(odd, /'@\u200bteam' \\\| x/);
});
