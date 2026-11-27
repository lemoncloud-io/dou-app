#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SETTINGS = path.join(ROOT, '.claude', 'settings.json');

const DISPATCH = [
    "const{spawnSync:s}=require('child_process'),f=require('fs'),p=require('path');",
    'const i=f.readFileSync(0);let c;try{c=JSON.parse(i).cwd}catch{}',
    "const t=(s('git',['-C',c||'.','rev-parse','--show-toplevel'],{encoding:'utf8'}).stdout||'').trim();",
    "const h=p.join(t,'.claude','hooks',process.argv[1]+'.cjs');",
    'if(!t||!f.existsSync(h))process.exit(0);',
    "const r=s(process.execPath,[h],{input:i,stdio:['pipe','inherit','inherit'],cwd:t,env:{...process.env,CLAUDE_PROJECT_DIR:t}});",
    'process.exit(r.status===null?1:r.status)',
].join('');

const hookCommand = name => `node -e "${DISPATCH}" ${name}`;

const command = (name, timeout) => ({ type: 'command', command: hookCommand(name), timeout });

const hooksConfig = () => ({
    PostToolUse: [
        { matcher: 'Edit|Write|MultiEdit', hooks: [command('lint-edited-file', 90)] },
        { matcher: 'Bash', hooks: [command('check-escalation', 10)] },
    ],
    PreToolUse: [{ matcher: 'Bash', hooks: [command('check-escalation', 10), command('gate-before-commit', 1800)] }],
    Stop: [{ hooks: [command('verify-before-stop', 30)] }],
    PostToolUseFailure: [{ matcher: 'Bash', hooks: [command('check-escalation', 10)] }],
    UserPromptSubmit: [{ hooks: [command('check-escalation', 10)] }],
});

const mainCheckout = root => {
    const common = execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
        encoding: 'utf8',
    }).trim();
    return path.dirname(fs.realpathSync(common));
};

const readJson = file => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return {};
        throw new Error(`${file} is not valid JSON; fix it by hand first (${error.message})`);
    }
};

const install = target => {
    const current = readJson(target);
    const hooks = readJson(SETTINGS).hooks;
    if (JSON.stringify(current.hooks) === JSON.stringify(hooks)) return 'unchanged';
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify({ ...current, hooks }, null, 4)}\n`);
    return current.hooks ? 'updated' : 'installed';
};

if (require.main === module) {
    const flag = process.argv.indexOf('--target');
    const target =
        flag === -1
            ? path.join(mainCheckout(ROOT), '.claude', 'settings.local.json')
            : path.resolve(process.argv[flag + 1]);
    console.log(`${install(target)}: hooks in ${target}`);
}

module.exports = { hookCommand, hooksConfig, install, mainCheckout };
