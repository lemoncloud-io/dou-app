#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const io = require('./io');
const { parseTag } = require('./version');

const STORE_NOTES_HEADER = 'Store notes:';

function marker(tag, env) {
    return `<!-- mobile-release ${tag} ${env} -->`;
}

function releaseTitle(plan) {
    return `DoU Mobile ${plan.release.version} (${plan.release.build})`;
}

function tagMessage({ version, build, env, platforms, requested = platforms, sha, storeNotes }) {
    return [
        `DoU Mobile ${version} (${build})`,
        '',
        `env: ${env}`,
        `platforms: ${platforms.join(', ')}`,
        `requested: ${requested.join(', ')}`,
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
    return {
        env: field('env'),
        platforms: list('platforms'),
        requested: list('requested'),
        storeNotes: notesAt === -1 ? '' : text.slice(notesAt + STORE_NOTES_HEADER.length + 2).trim(),
    };
}

function versionLine(plan) {
    const reasons = plan.proposal.reasons;
    const prs = [...new Set(reasons.map(item => item.pr).filter(Boolean))].map(number => `#${number}`);
    const basis =
        reasons.length === 0
            ? 'no commit reached the binary'
            : `${reasons.length} ${reasons[0].why} commit(s)${prs.length ? ` in ${prs.join(', ')}` : ''}`;
    const chosen =
        plan.release.unit === plan.proposal.autoUnit ? 'as proposed' : `proposed ${plan.proposal.unit || 'none'}`;
    return `${plan.release.unit} (${chosen}) — ${basis}. Base ${plan.base.version} from ${plan.base.source} \`${plan.base.ref}\`.`;
}

function releaseBody({ plan, env, platforms, actor, runUrl, uploadedAt, storeNotes, teamNotes }) {
    const compareFrom = plan.lastTag || plan.base.commit;
    const compare = plan.repo ? `https://github.com/${plan.repo}/compare/${compareFrom}...${plan.release.tag}` : null;
    return [
        '| Env | Uploaded | Platforms | By | Run |',
        '| --- | --- | --- | --- | --- |',
        `| ${env} | ${uploadedAt} | ${platforms.join(', ')} | ${actor} | ${runUrl ? `[run](${runUrl})` : '-'} |`,
        '',
        '## Team notes',
        '',
        (teamNotes || plan.teamNotes).trim(),
        '',
        '## Store notes',
        '',
        storeNotes.trim(),
        '',
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
    return `${marker(plan.release.tag, env)}\nIncluded in ${env} ${plan.release.version} (${plan.release.build}): ${releaseUrl}`;
}

async function ensureRelease(deps, plan, env, bodyFile) {
    const tag = plan.release.tag;
    const prerelease = env === 'dev' ? '--prerelease' : '--prerelease=false';
    let exists = true;
    try {
        await deps.gh(['release', 'view', tag, '--json', 'url']);
    } catch {
        exists = false;
    }
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
    const env = options.env || recorded.env;
    if (env !== 'dev') throw new Error(`finish supports env=dev only for now (got ${env})`);
    const platforms = options.platforms
        ? options.platforms
              .split(',')
              .map(item => item.trim())
              .filter(Boolean)
        : recorded.platforms;
    if (platforms.length === 0) throw new Error(`${tag} records no uploaded platform`);
    const storeNotes = (options.storeNotes || '').trim() || recorded.storeNotes;
    if (!storeNotes) throw new Error(`No store notes: pass them or tag ${tag} with them`);
    const plan = await deps.plan(tag);
    const teamNotes = (options.teamNotes || '').trim() || plan.teamNotes;
    const body = releaseBody({
        plan,
        env,
        platforms,
        actor: options.actor ? `@${options.actor}` : '-',
        runUrl: options.runUrl,
        uploadedAt: deps.git(['tag', '-l', '--format=%(taggerdate:iso8601-strict)', tag]),
        storeNotes,
        teamNotes,
    });
    if (options.dryRun) return { body, tag, teamNotes };
    deps.writeFile(options.bodyFile, body);
    const url = await ensureRelease(deps, plan, env, options.bodyFile);
    const commented = await commentOnPrs(deps, plan, env, url);
    deps.log(`Release ${url}; commented on ${commented.length} PR(s)`);
    return { body, tag, teamNotes, url, commented };
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
        '--team-notes-out': 'teamNotesOut',
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
    plan: tag => {
        const { buildPlan, defaultDeps: planDeps } = require('./plan');
        return buildPlan({ forTag: tag }, planDeps);
    },
    writeFile: (file, text) => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
    },
    log: message => console.log(message),
};

async function main(argv) {
    const options = parseArgs(argv);
    const result = await finish(options, defaultDeps);
    if (options.teamNotesOut) defaultDeps.writeFile(options.teamNotesOut, `${result.teamNotes.trim()}\n`);
    if (result.url && process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `url=${result.url}\n`);
    if (!result.url) process.stdout.write(result.body);
}

io.runMain(module, main);

module.exports = {
    marker,
    releaseTitle,
    tagMessage,
    parseTagMessage,
    releaseBody,
    prComment,
    finish,
    parseArgs,
    main,
};
