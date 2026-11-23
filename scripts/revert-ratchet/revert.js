#!/usr/bin/env node
const fs = require('node:fs');

const TEST_FILE = [/(^|\/)__tests__\//, /(^|\/)__mocks__\//, /\.(test|spec)\.[cm]?[jt]sx?$/, /^apps\/[^/]+-e2e\//];

const isTestFile = path => TEST_FILE.some(re => re.test(path));

function projectOf(path) {
    const m = /^(apps|libs)\/([^/]+)\//.exec(path);
    return m ? `${m[1]}/${m[2]}` : '(repository root)';
}

function code(text) {
    const clean = String(text)
        .replace(/`/g, "'")
        .replace(/\|/g, '\\|')
        .replace(/@/g, '@​')
        .replace(/[\r\n]+/g, ' ');
    return `\`${clean}\``;
}

function revertTargets({ title = '', body = '', commitMessages = [] }) {
    const text = [body, ...commitMessages].join('\n');
    const numbers = new Set();
    for (const m of text.matchAll(/\bReverts\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)/gi)) numbers.add(Number(m[1]));
    const shas = new Set();
    for (const m of text.matchAll(/\breverts commit ([0-9a-f]{7,40})/gi)) shas.add(m[1]);
    const quoted = /^Revert "(.*)"$/.exec(title.trim());
    return { numbers: [...numbers], shas: [...shas], revertedTitle: quoted ? quoted[1] : null };
}

function candidateRule(original) {
    if (!original) return 'Find the change the revert undid, then name the check that fails on it.';
    const files = (original.files || []).filter(f => !isTestFile(f));
    const projects = [...new Set(files.map(projectOf))];
    const where = projects.length ? projects.map(code).join(', ') : 'the reverted files';
    return `A test in ${where} that fails on the reverted change; or, if the mistake has a recognisable shape, a lint rule under \`tools/eslint-rules/\` that flags it.`;
}

function renderIssue({ revert, original }) {
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
        '- [ ] **Adversarial check.** Try to make the candidate fire on a correct change: run it over recent merged pull requests and over the code as it is. List every counterexample found and narrow the rule until none is left.',
        '- [ ] A person approves the rule after reading those counterexamples.',
        '- [ ] The rule or test lands, failing on the reverted change and passing on `develop`.',
        '',
        'If nothing deterministic could have caught it, say why here and close the issue.'
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

module.exports = { revertTargets, renderIssue, candidateRule };
