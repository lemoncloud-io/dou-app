#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const io = require('./io');
const { parseTag } = require('./version');
const { STATUSES, parseResults, formatResults, uploadedPlatforms } = require('./store');

const STORE_NOTES_HEADER = 'Store notes:';

function marker(tag, env) {
    return `<!-- mobile-release ${tag} ${env} -->`;
}

function releaseTitle(plan) {
    return `DoU Mobile ${plan.release.version} (${plan.release.build})`;
}

function tagMessage({ version, build, env, results, sha, storeNotes, branch = 'develop' }) {
    return [
        `DoU Mobile ${version} (${build})`,
        '',
        `env: ${env}`,
        `branch: ${branch}`,
        `platforms: ${uploadedPlatforms(results).join(', ')}`,
        `requested: ${Object.keys(results).join(', ')}`,
        `results: ${formatResults(results)}`,
        `commit: ${sha}`,
        '',
        STORE_NOTES_HEADER,
        storeNotes.trim(),
    ].join('\n');
}

function parseTagMessage(message) {
    const text = message || '';
    const field = name => {
        const match = new RegExp(`^${name}: (.*)$`, 'm').exec(text);
        return match ? match[1].trim() : null;
    };
    const notesAt = text.indexOf(`\n${STORE_NOTES_HEADER}\n`);
    const list = name =>
        (field(name) || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
    const platforms = list('platforms');
    const requested = list('requested');
    let results = field('results') ? parseResults(field('results')) : null;
    if (!results) {
        results = {};
        for (const platform of requested.length ? requested : platforms) {
            results[platform] = platforms.includes(platform) ? 'uploaded' : 'failed';
        }
    }
    return {
        env: field('env'),
        branch: field('branch') || 'develop',
        platforms,
        requested,
        results,
        storeNotes: notesAt === -1 ? '' : text.slice(notesAt + STORE_NOTES_HEADER.length + 2).trim(),
    };
}

function versionLine(plan) {
    const { proposalReason } = require('./plan');
    const chosen =
        plan.release.unit === plan.proposal.autoUnit ? 'as proposed' : `proposed ${plan.proposal.unit || 'none'}`;
    return `${plan.release.unit} (${chosen}) — ${proposalReason(plan.proposal)}. Base ${plan.base.version} from ${plan.base.source} \`${plan.base.ref}\`.`;
}

function platformCell(results, platform) {
    return results[platform] ? STATUSES[results[platform]] : '-';
}

const ENVS = ['dev', 'prod'];
const TABLE_HEAD = ['| Env | Uploaded | iOS | Android | By | Run |', '| --- | --- | --- | --- | --- | --- |'];

function envRow({ env, uploadedAt, results, actor, runUrl }) {
    return `| ${env} | ${uploadedAt} | ${platformCell(results, 'ios')} | ${platformCell(results, 'android')} | ${actor} | ${runUrl ? `[run](${runUrl})` : '-'} |`;
}

function parseRows(body) {
    const labels = Object.fromEntries(Object.entries(STATUSES).map(([key, label]) => [label, key]));
    const rows = {};
    for (const line of (body || '').split('\n')) {
        const cells = line.split('|').map(cell => cell.trim());
        if (cells.length < 8 || !ENVS.includes(cells[1])) continue;
        const results = {};
        if (labels[cells[3]]) results.ios = labels[cells[3]];
        if (labels[cells[4]]) results.android = labels[cells[4]];
        rows[cells[1]] = { line, results };
    }
    return rows;
}

const PROD_NOTES = '## Prod store notes';

function prodStoreNotes(body) {
    const text = body || '';
    const at = text.indexOf(`${PROD_NOTES}\n\n`);
    if (at === -1) return '';
    const rest = text.slice(at + PROD_NOTES.length + 2);
    const end = rest.indexOf('\n## ');
    return (end === -1 ? rest : rest.slice(0, end)).trim();
}

function releaseBody({ plan, rows, storeNotes, prodNotes, teamNotes }) {
    const compareFrom = plan.lastTag || plan.base.commit;
    const compare = plan.repo ? `https://github.com/${plan.repo}/compare/${compareFrom}...${plan.release.tag}` : null;
    return [
        ...TABLE_HEAD,
        ...rows,
        '',
        '## Team notes',
        '',
        (teamNotes || plan.teamNotes).trim(),
        '',
        '## Store notes',
        '',
        storeNotes.trim(),
        '',
        ...(prodNotes ? [PROD_NOTES, '', prodNotes.trim(), ''] : []),
        '## Version',
        '',
        versionLine(plan),
        '',
        '## Commit',
        '',
        `\`${plan.to.sha}\`${compare ? ` · [changes since ${plan.lastTag || plan.base.ref}](${compare})` : ''}`,
        '',
    ].join('\n');
}

function prComment({ plan, env, releaseUrl }) {
    return `${marker(plan.release.tag, env)}\nShipped in ${env} ${plan.release.version} (${plan.release.build}) · ${releaseUrl}`;
}

async function readRelease(deps, tag) {
    try {
        return JSON.parse(await deps.gh(['release', 'view', tag, '--json', 'body,isPrerelease']));
    } catch {
        return null;
    }
}

async function ensureRelease(deps, plan, env, bodyFile, exists) {
    const tag = plan.release.tag;
    const prerelease = env === 'dev' ? '--prerelease' : '--prerelease=false';
    const args = ['--title', releaseTitle(plan), '--notes-file', bodyFile, prerelease, '--latest=false'];
    if (exists) await deps.gh(['release', 'edit', tag, ...args]);
    else await deps.gh(['release', 'create', tag, '--verify-tag', ...args]);
    const out = await deps.gh(['release', 'view', tag, '--json', 'url', '--jq', '.url']);
    return out.trim();
}

async function commentOnPrs(deps, plan, env, releaseUrl) {
    const tagMarker = marker(plan.release.tag, env);
    const posted = [];
    for (const pr of plan.prs) {
        const bodies = await deps.gh([
            'api',
            '--paginate',
            `repos/${plan.repo}/issues/${pr.number}/comments`,
            '--jq',
            '.[].body',
        ]);
        if (bodies.includes(tagMarker)) continue;
        await deps.gh([
            'api',
            '-X',
            'POST',
            `repos/${plan.repo}/issues/${pr.number}/comments`,
            '-f',
            `body=${prComment({ plan, env, releaseUrl })}`,
        ]);
        posted.push(pr.number);
    }
    return posted;
}

async function finish(options, deps) {
    const tag = options.tag;
    if (!parseTag(tag)) throw new Error(`${tag} is not a mobile-v<version>-<build> tag`);
    const sha = deps.tryGit(['rev-list', '-n', '1', tag]);
    if (!sha) throw new Error(`${tag} does not exist; finish runs after the tag is pushed`);
    const recorded = parseTagMessage(deps.git(['tag', '-l', '--format=%(contents)', tag]));
    if (recorded.env !== 'dev') throw new Error(`${tag} is not a dev build tag (env: ${recorded.env})`);
    const env = options.env || 'dev';
    if (!ENVS.includes(env)) throw new Error(`env must be dev or prod (got ${env})`);
    const existing = await readRelease(deps, tag);
    const rows = parseRows(existing && existing.body);
    if (env === 'prod' && !rows.dev) {
        throw new Error(
            `${tag} has no GitHub release with a dev upload; prod ships only builds that reached the dev app`
        );
    }
    let results;
    let row;
    if (options.platforms) results = parseResults(options.platforms);
    else if (env === 'dev') results = recorded.results;
    else if (rows.prod) ({ results, line: row } = rows.prod);
    else throw new Error(`Pass the prod upload results (--platforms ios=uploaded,...) for ${tag}`);
    if (uploadedPlatforms(results).length === 0) throw new Error(`${tag} records no uploaded platform for ${env}`);
    const given = (options.storeNotes || '').trim();
    const storeNotes = (env === 'dev' && given) || recorded.storeNotes;
    if (!storeNotes) throw new Error(`No store notes: pass them or tag ${tag} with them`);
    const prodNotes =
        env === 'prod' ? given || prodStoreNotes(existing && existing.body) : prodStoreNotes(existing && existing.body);
    if (env === 'prod' && !prodNotes) {
        throw new Error(`Pass the prod store notes (--store-notes) for ${tag}; they are written for the prod range`);
    }
    const plan = await deps.plan(tag, env);
    const teamNotes = (options.teamNotes || '').trim() || plan.teamNotes;
    const cardNotes = (options.teamNotes || '').trim() || plan.cardNotes;
    const actor = options.actor ? `@${options.actor}` : '-';
    const ownRow =
        row ||
        envRow({
            env,
            results,
            actor,
            runUrl: options.runUrl,
            uploadedAt:
                env === 'dev' ? deps.git(['tag', '-l', '--format=%(taggerdate:iso8601-strict)', tag]) : deps.now(),
        });
    const devRow = env === 'dev' ? ownRow : rows.dev.line;
    const body = releaseBody({
        plan,
        rows: env === 'dev' ? [devRow, ...(rows.prod ? [rows.prod.line] : [])] : [devRow, ownRow],
        storeNotes,
        prodNotes,
        teamNotes,
    });
    const summary = { body, tag, env, branch: recorded.branch, results, teamNotes, cardNotes };
    if (options.dryRun) return summary;
    deps.writeFile(options.bodyFile, body);
    const url = await ensureRelease(deps, plan, env, options.bodyFile, Boolean(existing));
    const commented = await commentOnPrs(deps, plan, env, url);
    deps.log(`Release ${url}; commented on ${commented.length} PR(s)`);
    return { ...summary, url, commented };
}

function parseArgs(argv) {
    const options = { bodyFile: 'apps/mobile/.release/release-body.md' };
    const keys = {
        '--env': 'env',
        '--platforms': 'platforms',
        '--store-notes': 'storeNotes',
        '--team-notes': 'teamNotes',
        '--run-url': 'runUrl',
        '--actor': 'actor',
        '--body-file': 'bodyFile',
        '--card-notes-out': 'cardNotesOut',
    };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--dry-run') options.dryRun = true;
        else if (keys[argv[i]]) {
            options[keys[argv[i]]] = argv[i + 1];
            i += 1;
        } else if (!argv[i].startsWith('--') && !options.tag) options.tag = argv[i];
        else throw new Error(`Unknown argument: ${argv[i]}`);
    }
    if (!options.tag) throw new Error('finish needs a mobile-v tag');
    return options;
}

const defaultDeps = {
    git: io.git,
    tryGit: io.tryGit,
    gh: io.gh,
    plan: (tag, env) => {
        const { buildPlan, defaultDeps: planDeps } = require('./plan');
        return buildPlan({ forTag: tag, env }, planDeps);
    },
    now: () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    writeFile: (file, text) => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
    },
    log: message => console.log(message),
};

async function main(argv) {
    const options = parseArgs(argv);
    const result = await finish(options, defaultDeps);
    if (options.cardNotesOut) defaultDeps.writeFile(options.cardNotesOut, `${result.cardNotes.trim()}\n`);
    if (process.env.GITHUB_OUTPUT) {
        const lines = [`env=${result.env}`, `branch=${result.branch}`, `results=${formatResults(result.results)}`];
        if (result.url) lines.push(`url=${result.url}`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
    }
    if (!result.url) process.stdout.write(result.body);
}

io.runMain(module, main);

module.exports = {
    marker,
    releaseTitle,
    tagMessage,
    parseTagMessage,
    envRow,
    parseRows,
    prodStoreNotes,
    releaseBody,
    prComment,
    finish,
    parseArgs,
    main,
};
