const { FIX_LINE_LIMIT, BLOCKING_LABEL } = require('./classify');

const HINTS = [
    [/label is set/, `Remove the \`${BLOCKING_LABEL}\` label once a reviewer is no longer wanted.`],
    [/is a draft/, 'Mark the pull request ready for review.'],
    [/from a fork/, 'Push the branch to this repository instead of a fork.'],
    [/base branch is/, 'Target `develop`.'],
    [/visual regression check has not finished/, 'Nothing to do: the verdict is taken again when verify finishes.'],
    [/screenshot difference/, 'Fix the screen, or have a reviewer accept the new screenshot.'],
    [
        /is always reviewed/,
        'Move the always-reviewed files into a pull request of their own; the rest may then qualify.',
    ],
    [/binary file|changed type|control character/, 'Move that file into a pull request of its own.'],
    [/diff is empty/, 'Push the change.'],
    [
        /added or reworded|no comment was removed|tool directive/,
        'Keep a comment cleanup to removals only, with the code untouched, in a pull request of its own.',
    ],
    [/does not parse/, 'Make the file parse before and after the change.'],
    [/source file was added or deleted|no proof class|not only comments/, null],
    [
        /rose|entry added|not a count|baseline/,
        'Only lower baseline counts; raising one or adding an entry needs a reviewer.',
    ],
    [
        /test file was deleted|test cases dropped|marker was added/,
        'Keep every existing test case, and drop any `.only` / `.skip` added.',
    ],
    [
        /not a `fix` commit|no commits/,
        'For a small fix, make every commit a `fix:` commit (squash or reword the others).',
    ],
    [/non-test lines changed/, `For a small fix, keep the change outside tests to ${FIX_LINE_LIMIT} lines or fewer.`],
    [/projects:/, 'For a small fix, keep the non-test change inside one project.'],
    [/no test file changed/, 'For a small fix, add or extend a test that fails without the fix.'],
];

function reasonsOf(result) {
    if (result.blocks.length) return result.blocks;
    return [...(result.proof ? result.proof.failed.map(p => p.why) : []), ...(result.fix ? result.fix.fails : [])];
}

/** What would make an ineligible pull request eligible, one line per distinct remedy. */
function hintsFor(result) {
    if (result.eligible) return [];
    const out = [];
    for (const reason of reasonsOf(result)) {
        const hit = HINTS.find(([re]) => re.test(reason));
        if (hit && hit[1] && !out.includes(hit[1])) out.push(hit[1]);
    }
    return out;
}

module.exports = { hintsFor };
