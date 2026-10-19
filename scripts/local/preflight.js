const fs = require('fs');
const net = require('net');
const path = require('path');

const { parseEnv } = require('../mobile-verify/envfile');

const { PAIRS } = require('./pairs');

/**
 * Where a missing env file comes from. `.env` is the local env and has a template; the per-backend
 * files carry real endpoints and have none — a copy of the template there would point the web at the
 * local values (or leave the Google client empty), so the line says where they are kept instead.
 */
const LOCAL_ENV_SOURCE = relative => `cp ${relative}.example ${relative}, then fill in your values`;
const BACKEND_ENV_SOURCE =
    'download it from the team secrets repository, where it sits at the same path (ONBOARDING.md § Env and Firebase files) — it carries real endpoints, is not in git and has no template';

/**
 * What a run needs, as `{ message, fix }` problems — empty when it can go. Read-only: nothing here
 * creates a file or stops a process; a port another process holds is reported, not taken.
 */
async function findProblems(root, { mode, env }, { portFree = isPortFree } = {}) {
    const problems = [];
    const exists = relative => fs.existsSync(path.join(root, relative));

    if (!exists('node_modules')) {
        problems.push({ message: 'node_modules is missing — dependencies are not installed.', fix: 'yarn install' });
    }
    if (mode === 'native') return problems;

    if (!exists('apps/web/.env')) {
        problems.push({ message: 'apps/web/.env is missing.', fix: LOCAL_ENV_SOURCE('apps/web/.env') });
    }
    if (!exists(`apps/web/.env.${env}`)) {
        problems.push({
            message: `apps/web/.env.${env} is missing — the web's ${env} backend settings.`,
            fix: BACKEND_ENV_SOURCE,
        });
    }
    if (mode === 'shell') {
        const mobileEnv = `apps/mobile/.env.${env}`;
        if (!exists(mobileEnv)) {
            problems.push({
                message: `${mobileEnv} is missing — the shell reads the Google sign-in client from it.`,
                fix: BACKEND_ENV_SOURCE,
            });
        } else if (!readEnv(root, mobileEnv).get('VITE_GOOGLE_WEB_CLIENT_ID')) {
            problems.push({
                message: `${mobileEnv} has no VITE_GOOGLE_WEB_CLIENT_ID — Google sign-in in the shell needs it.`,
                fix: `add VITE_GOOGLE_WEB_CLIENT_ID to ${mobileEnv} (the value the ${env} mobile build uses)`,
            });
        }
    }

    // The web mode is dev only, on dev's web port; the shell runs the chosen backend's own pair.
    const pair = PAIRS[mode === 'shell' ? env : 'dev'];
    const ports = mode === 'shell' ? [pair.web, pair.shell] : [pair.web];
    for (const port of ports) {
        if (!(await portFree(port))) {
            problems.push({
                message: `port ${port} is taken by another process (left running, not stopped).`,
                fix: `stop whatever listens on it (lsof -nP -iTCP:${port} -sTCP:LISTEN shows it), then run again`,
            });
        }
    }
    return problems;
}

function readEnv(root, relative) {
    return parseEnv(fs.readFileSync(path.join(root, relative), 'utf8'));
}

function isPortFree(port) {
    return new Promise(resolve => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => server.close(() => resolve(true)));
        server.listen(port, 'localhost');
    });
}

function formatProblems(problems) {
    const lines = [`${problems.length} problem(s) stop yarn local:`, ''];
    problems.forEach((problem, index) => {
        lines.push(`  ${index + 1}. ${problem.message}`);
        lines.push(`       fix: ${problem.fix}`);
    });
    return lines.join('\n');
}

module.exports = { findProblems, formatProblems, readEnv };
