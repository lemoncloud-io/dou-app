#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const { readInput, modeOf, decideBlock } = require('./lib.cjs');

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SOURCE = /^(apps|libs|tools)\/.*\.(ts|tsx|js|jsx|mjs|cjs|kt|java|swift|m|mm)$/;
const REPORT = /verify-report[^"'\s]*\.html/;
const SHELL_WRITE = /(sed\s+-i|perl\s+-p?i|\btee\b|>{1,2}\s*\S|writeFileSync|apply_patch|git\s+apply)/;
const SHELL_PATH = /(?:^|[\s'"=(/])((?:apps|libs|tools)\/[^\s'"|;&)]+)/g;

const repoPath = (file, root) => {
    const inWorktree = file.match(/^.*\/\.claude\/worktrees\/[^/]+\/(.+)$/);
    if (inWorktree) return inWorktree[1];
    const relative = path.relative(root, file);
    return relative.startsWith('..') || path.isAbsolute(relative) ? '' : relative;
};

const isSource = file => SOURCE.test(file) && !file.includes('node_modules/');

const shellEdits = command =>
    typeof command === 'string' && SHELL_WRITE.test(command)
        ? [...command.matchAll(SHELL_PATH)].map(match => match[1]).filter(isSource)
        : [];

const isPrompt = entry => {
    if (entry.type !== 'user' || entry.isMeta || entry.isCompactSummary) return false;
    const content = entry.message?.content;
    if (typeof content === 'string') return true;
    return Array.isArray(content) && content.every(block => block.type !== 'tool_result');
};

const thisTurn = entries => {
    let start = 0;
    entries.forEach((entry, i) => {
        if (isPrompt(entry)) start = i + 1;
    });
    return entries.slice(start);
};

const toolUses = entries =>
    entries.flatMap(entry =>
        entry.type === 'assistant' && Array.isArray(entry.message?.content)
            ? entry.message.content.filter(block => block.type === 'tool_use')
            : []
    );

const evaluate = (entries, root) => {
    const uses = toolUses(thisTurn(entries));
    const changed = [
        ...uses
            .filter(use => EDIT_TOOLS.has(use.name))
            .map(use => repoPath(use.input?.file_path ?? use.input?.notebook_path ?? '', root))
            .filter(isSource),
        ...uses.filter(use => use.name === 'Bash').flatMap(use => shellEdits(use.input?.command)),
    ];
    const reported = uses.some(use => REPORT.test(JSON.stringify(use.input ?? {})));
    if (!changed.length || reported) return null;
    const files = [...new Set(changed)].slice(0, 5).join(', ');
    return {
        decision: 'block',
        reason: `Source changed this turn (${files}) and no verification report was produced. Open the dou-verify skill, run the method that fits, and publish verify-report-<topic>.html. If this change cannot be verified now, say why in your reply instead.`,
    };
};

const readTranscript = file =>
    fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .flatMap(line => {
            try {
                return [JSON.parse(line)];
            } catch {
                return [];
            }
        });

if (require.main === module) {
    const input = readInput();
    if (input.stop_hook_active || !input.transcript_path || !fs.existsSync(input.transcript_path)) process.exit(0);
    const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
    const verdict = evaluate(readTranscript(input.transcript_path), root);
    const outcome = decideBlock({
        name: 'verify-before-stop',
        session: input.session_id,
        mode: modeOf('verify-before-stop'),
        block: Boolean(verdict),
        detail: verdict ? { reason: verdict.reason.slice(0, 200) } : undefined,
    });
    if (outcome.blocked) process.stdout.write(`${JSON.stringify(verdict)}\n`);
}

module.exports = { isPrompt, thisTurn, shellEdits, evaluate };
