const { CLASS_NAMES, FIX_LINE_LIMIT, BLOCKING_LABEL } = require('./classify');

const { code } = require('./text');
const { hintsFor } = require('./hints');

const MARKER = '<!-- auto-merge-eligibility -->';
const MAX_ROWS = 30;

const ACTIONS = {
    enabled: 'Auto-merge is on. GitHub merges this pull request once the required checks pass on this commit.',
    'no-required-checks':
        'Auto-merge stays off: `develop` has no ruleset requiring the verify and e2e checks, so auto-merge would merge without waiting for CI.',
    'no-token':
        'Auto-merge stays off: the `AUTO_MERGE_TOKEN` secret is not set, and a merge made with the default token would not start the deploy workflow.',
    'not-eligible': 'Auto-merge is off. A reviewer has to approve and merge this one.',
    'enable-failed': 'Auto-merge could not be turned on; see the workflow run log.',
    observe:
        'Observe mode: this pull request **would auto-merge** once the required checks pass. Nothing was turned on; a reviewer still merges it while the rules are being watched.',
};

function list(items) {
    return items.map(s => `- ${s}`).join('\n');
}

function proofTable(proofs) {
    const rows = proofs
        .slice(0, MAX_ROWS)
        .map(p => `| ${code(p.path)} | ${p.cls || '—'} | ${p.ok ? 'proven' : p.why} |`);
    const more = proofs.length > MAX_ROWS ? `\n\n…and ${proofs.length - MAX_ROWS} more files.` : '';
    return ['| File | Class | Result |', '| --- | --- | --- |', ...rows].join('\n') + more;
}

function render(result, { headSha, action, runUrl } = {}) {
    const out = [MARKER, '### Auto-merge eligibility', ''];
    const sha = headSha ? ` for \`${headSha.slice(0, 7)}\`` : '';
    if (result.eligible) {
        const names = result.classes.map(c => `**${c}** ${CLASS_NAMES[c]}`).join(' + ');
        out.push(`**Eligible**${sha}: ${names}.`);
    } else {
        out.push(`**Not eligible**${sha}.`);
    }
    out.push('', ACTIONS[action] || ACTIONS[result.eligible ? 'enabled' : 'not-eligible'], '');

    if (result.blocks.length) {
        out.push('Stopped by:', list(result.blocks), '');
    } else if (result.eligible && result.classes[0] !== 'B') {
        out.push(
            '<details><summary>Why each file is safe</summary>',
            '',
            proofTable(result.proof.proofs),
            '',
            '</details>',
            ''
        );
    } else if (result.eligible) {
        out.push(
            `Every commit is a \`fix\`, ${result.fix.lines} non-test lines (limit ${FIX_LINE_LIMIT}) in ${code(result.fix.projects[0])}, with a test change.`,
            ''
        );
    } else {
        out.push(
            'Not a provably unchanged-behaviour change:',
            list(result.proof.failed.slice(0, 10).map(p => `${code(p.path)}: ${p.why}`)),
            ''
        );
        out.push('Not a small fix:', list(result.fix.fails), '');
    }

    const hints = hintsFor(result);
    if (hints.length) out.push('To make it eligible:', list(hints), '');

    out.push(
        `<sub>Add the \`${BLOCKING_LABEL}\` label to keep this pull request out of auto-merge. Rules: \`scripts/auto-merge/README.md\`.${runUrl ? ` [Run](${runUrl})` : ''}</sub>`
    );
    return out.join('\n');
}

module.exports = { render, MARKER, ACTIONS };
