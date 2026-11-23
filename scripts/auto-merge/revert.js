#!/usr/bin/env node
const fs = require('node:fs');
const rules = require('./rules');
const { code } = require('./text');

const ELIGIBLE_LABEL = 'auto-merge:eligible';

function revertTargets({ title = '', body = '', commitMessages = [] }) {
    const text = [body, ...commitMessages].join('\n');
    const numbers = new Set();
    for (const m of text.matchAll(/\bReverts\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)/gi)) numbers.add(Number(m[1]));
    const shas = new Set();
    for (const m of text.matchAll(/\breverts commit ([0-9a-f]{7,40})/gi)) shas.add(m[1]);
    const quoted = /^Revert "(.*)"$/.exec(title.trim());
    return { numbers: [...numbers], shas: [...shas], revertedTitle: quoted ? quoted[1] : null };
}

/** A starting point for the rule, from what the reverted pull request touched. */
function candidateRule(original) {
    if (!original) return 'Find the change the revert undid, then name the check that fails on it.';
    const files = (original.files || []).filter(f => !rules.isTestFile(f));
    const projects = [...new Set(files.map(f => rules.projectOf(f) || '(repository root)'))];
    const where = projects.length ? projects.map(code).join(', ') : 'the reverted files';
    if ((original.labels || []).includes(ELIGIBLE_LABEL)) {
        return `Tighten the auto-merge class #${original.number} passed in \`scripts/auto-merge/\`, and add a test in ${where} that fails on the reverted change.`;
    }
    return `A test in ${where} that fails on the reverted change; or, if the mistake has a recognisable shape, a lint rule under \`tools/eslint-rules/\` that flags it.`;
}

function renderIssue({ revert, original }) {
    const auto = original && (original.labels || []).includes(ELIGIBLE_LABEL);
    const files = original ? (original.files || []).slice(0, 15) : [];
    const lines = [
        `#${revert.number} reverted ${original ? `#${original.number} (${code(original.title)})` : 'a change whose pull request could not be found'}.`,
        '',
        'A revert means a mistake reached `develop`. Turn it into something that fails before merge next time.',
        '',
        `**Candidate rule:** ${candidateRule(original)}`,
        '',
    ];
    if (files.length) lines.push('Files the reverted pull request touched:', ...files.map(f => `- ${code(f)}`), '');
    lines.push(
        'Before it becomes a lint rule or a test:',
        '',
        '- [ ] **Adversarial check.** Try to make the candidate fire on a correct change: run it over recent merged pull requests (`node scripts/auto-merge/backtest.js` replays them) and over the code as it is. List every counterexample found and narrow the rule until none is left.',
        '- [ ] A person approves the rule after reading those counterexamples.',
        '- [ ] The rule or test lands, failing on the reverted change and passing on `develop`.',
        '',
        'If nothing deterministic could have caught it, say why here and close the issue.',
        '',
        `Auto-merged: ${auto ? `**yes** — #${original.number} carried \`${ELIGIBLE_LABEL}\`.` : 'no'}`
    );
    return lines.join('\n');
}

function main(argv) {
    const [command, file] = argv;
    const input = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (command === 'targets') process.stdout.write(JSON.stringify(revertTargets(input)));
    else if (command === 'issue') process.stdout.write(renderIssue(input));
    else throw new Error('usage: revert.js targets|issue <input.json>');
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { revertTargets, renderIssue, candidateRule, ELIGIBLE_LABEL };
