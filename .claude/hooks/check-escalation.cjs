#!/usr/bin/env node
const fs = require('fs');

const { readInput, modeOf, record, loadState, saveState } = require('./lib.cjs');

const NAME = 'check-escalation';
const LIMIT = 3;
const CHECK =
    /(?:^|&&|\|\||[;|(\n])\s*(?:\w+=\S+\s+)*(?:npx\s+)?(yarn\s+(?:gate|check:[\w-]+|web:e2e[\w:-]*|web:test|lint|test|typecheck)(?=\s|$)|nx\s+(?:run-many|run|test|lint|typecheck|e2e|affected)\b[^;&|\n]*|jest\b[^;&|\n]*|playwright\s+test\b[^;&|\n]*|tsc\s+-[bp]\s+[^;&|\n]*|node\s+scripts\/check-[\w-]+\.js)/;

const checkKey = command => (typeof command === 'string' ? command.match(CHECK)?.[1].replace(/\s+/g, ' ').trim() : undefined);

const handOff = (key, error) =>
    `Third failure in a row of \`${key}\`. Stop changing code for it. Hand it to the user now: the command, the last error lines, what each of the three attempts changed, and your best hypothesis.${error ? `\nLast error: ${String(error).split('\n').slice(0, 8).join('\n')}` : ''}`;

const handle = (input, mode = modeOf(NAME)) => {
    if (mode === 'off') return { exit: 0 };
    const session = input?.session_id;
    const event = input?.hook_event_name;
    const state = loadState(session);
    state.failures = state.failures ?? {};
    if (event === 'UserPromptSubmit') {
        if (Object.keys(state.failures).length) {
            state.failures = {};
            saveState(session, state);
        }
        return { exit: 0 };
    }
    const key = checkKey(input?.tool_input?.command);
    if (!key) return { exit: 0 };
    if (event === 'PreToolUse') {
        if ((state.failures[key] ?? 0) < LIMIT) return { exit: 0 };
        if (mode === 'observe') {
            record(NAME, { session, outcome: 'would-block', key });
            return { exit: 0 };
        }
        record(NAME, { session, outcome: 'blocked', key });
        return { exit: 2, stderr: `${handOff(key)}\nThe check stays blocked until the user replies.` };
    }
    if (event === 'PostToolUse') {
        if (state.failures[key]) {
            delete state.failures[key];
            saveState(session, state);
        }
        return { exit: 0 };
    }
    if (event === 'PostToolUseFailure') {
        if (input?.is_interrupt) return { exit: 0 };
        state.failures[key] = (state.failures[key] ?? 0) + 1;
        saveState(session, state);
        if (state.failures[key] !== LIMIT) return { exit: 0 };
        if (mode === 'observe') {
            record(NAME, { session, outcome: 'would-escalate', key });
            return { exit: 0 };
        }
        record(NAME, { session, outcome: 'escalated', key });
        return { exit: 2, stderr: handOff(key, input?.error) };
    }
    return { exit: 0 };
};

if (require.main === module) {
    const outcome = handle(readInput());
    if (outcome.stderr) process.stderr.write(`${outcome.stderr}\n`);
    process.exit(outcome.exit);
}

module.exports = { checkKey, handle, LIMIT };
