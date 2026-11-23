const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MODES = ['off', 'observe', 'enforce'];
const BLOCKS_BEFORE_ESCAPE = 2;

const STATE_DAYS = 3;

const sharedLogDir = () => {
    const common = spawnSync('git', ['-C', __dirname, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
        encoding: 'utf8',
    });
    return common.status === 0 ? path.join(common.stdout.trim(), 'dou-hooks') : path.join(__dirname, 'log');
};

let cachedLogDir;
const logDir = () => process.env.DOU_HOOK_LOG_DIR || (cachedLogDir ??= sharedLogDir());

const readJson = (file, fallback) => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return fallback;
    }
};

const modeOf = (name, modes = readJson(process.env.DOU_HOOK_MODES || path.join(__dirname, 'modes.json'), {})) =>
    MODES.includes(modes[name]) ? modes[name] : 'observe';

const record = (name, entry) => {
    fs.mkdirSync(logDir(), { recursive: true });
    fs.appendFileSync(path.join(logDir(), `${name}.jsonl`), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
};

const stateFile = session => path.join(logDir(), `state-${String(session || 'unknown').replace(/[^\w-]/g, '')}.json`);
const loadState = session => readJson(stateFile(session), { blocks: {}, failures: {} });
const pruneStates = () => {
    const cutoff = Date.now() - STATE_DAYS * 86_400_000;
    for (const name of fs.readdirSync(logDir())) {
        const file = path.join(logDir(), name);
        if (name.startsWith('state-') && fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true });
    }
};

const saveState = (session, state) => {
    fs.mkdirSync(logDir(), { recursive: true });
    fs.writeFileSync(stateFile(session), JSON.stringify(state));
    pruneStates();
};

const decideBlock = ({ name, session, mode, block, reason, detail }) => {
    const state = loadState(session);
    if (!block) {
        if (state.blocks[name]) {
            delete state.blocks[name];
            saveState(session, state);
        }
        return { blocked: false };
    }
    if (mode === 'off') return { blocked: false };
    if (mode === 'observe') {
        record(name, { session, outcome: 'would-block', detail });
        return { blocked: false, observed: true };
    }
    const previous = state.blocks[name] ?? 0;
    if (previous >= BLOCKS_BEFORE_ESCAPE && reason) {
        delete state.blocks[name];
        saveState(session, state);
        record(name, { session, outcome: 'override', reason, detail });
        return { blocked: false, overridden: true };
    }
    state.blocks[name] = previous + 1;
    saveState(session, state);
    record(name, { session, outcome: 'blocked', count: state.blocks[name], detail });
    return { blocked: true, count: state.blocks[name], escapeOpen: state.blocks[name] >= BLOCKS_BEFORE_ESCAPE };
};

const readInput = () => {
    try {
        return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
    } catch {
        return {};
    }
};

module.exports = { logDir, readInput, modeOf, record, loadState, saveState, decideBlock, BLOCKS_BEFORE_ESCAPE };
