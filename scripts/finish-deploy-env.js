#!/usr/bin/env node
/**
 * Finish the env file a deploy workflow wrote for one app, and refuse one the build should not run with.
 *
 * The workflows write every `VITE_*` line from a secret, and a line whose secret does not apply to the app
 * (or is not set) comes out empty. This drops those lines, then holds what is left to `scripts/env-keys.js`:
 * every backend key the app carries is set, and `VITE_ENV` says the stage being deployed. A missing
 * secret used to vanish with the empty lines and build an app with no address for that server; now the
 * job stops before the build.
 *
 * Only key names are printed. The values are secrets, and GitHub masks only the ones it knows about.
 *
 * Usage (from a workflow step, after the file is written):
 *   node scripts/finish-deploy-env.js <project> <dev|prod> [file]   # file defaults to apps/<project>/.env
 */
const fs = require('fs');
const path = require('path');

const { APPS, STAGE_VALUES } = require('./env-keys');

const keyOf = line => (line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/) || [])[1];
const isEmpty = line => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*$/.test(line);

/**
 * The finished file for `project` deployed to `stage`: its text without the empty lines, the keys it
 * keeps, and what is wrong with it. A project the key table does not list (a tool with no backend) is
 * only tidied.
 */
const finishDeployEnv = (text, project, stage) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '' && !isEmpty(line));
    const keys = lines.map(keyOf).filter(Boolean);
    const values = Object.fromEntries(
        lines.filter(keyOf).map(line => [keyOf(line), line.slice(line.indexOf('=') + 1).trim()])
    );
    const problems = [];
    const app = APPS[project];
    if (app) {
        const missing = app.carries.filter(key => !values[key]);
        if (missing.length > 0) {
            problems.push(`${missing.join(', ')} not set — check the ${stage} secrets for ${project}`);
        }
        const expected = STAGE_VALUES[stage];
        if (!expected) {
            problems.push(`unknown stage '${stage}'`);
        } else if (values.VITE_ENV && values.VITE_ENV !== expected) {
            problems.push(`VITE_ENV is not ${expected}`);
        }
    }
    return { text: lines.join('\n') + '\n', keys, problems };
};

if (require.main === module) {
    const [project, stage, fileArg] = process.argv.slice(2);
    if (!project || !stage) {
        console.error('Usage: node scripts/finish-deploy-env.js <project> <dev|prod> [file]');
        process.exit(2);
    }
    const file = fileArg ?? path.join('apps', project, '.env');
    const { text, keys, problems } = finishDeployEnv(fs.readFileSync(file, 'utf8'), project, stage);
    fs.writeFileSync(file, text);
    console.log(`Wrote ${file} (${keys.length} keys): ${keys.join(', ')}`);
    if (problems.length > 0) {
        for (const problem of problems) console.error(`✗ ${project} ${stage}: ${problem}`);
        process.exit(1);
    }
}

module.exports = { finishDeployEnv };
