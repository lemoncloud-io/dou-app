#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const io = require('./io');
const { checkStoreNotes } = require('./notes');
const { tagMessage } = require('./finish');
const { parseTag } = require('./version');

const PLATFORMS = ['ios', 'android'];
const RELEASE_WORKFLOW = 'mobile-release.yml';
const FINISH_WORKFLOW = 'mobile-release-finish.yml';
const MOBILE_TAGS = 'refs/tags/mobile-v*:refs/tags/mobile-v*';
const ACTIVE_RUN = ['queued', 'in_progress', 'waiting', 'pending', 'requested'];

const KEY_FILES = [
    { label: 'apps/mobile/fastlane/.env', match: dir => exists(path.join(dir, 'apps/mobile/fastlane/.env')) },
    {
        label: 'apps/mobile/fastlane/AuthKey_*.p8',
        match: dir => listDir(path.join(dir, 'apps/mobile/fastlane')).some(name => /^AuthKey_.+\.p8$/.test(name)),
    },
    {
        label: 'apps/mobile/fastlane/play-service-account-dev.json',
        match: dir => exists(path.join(dir, 'apps/mobile/fastlane/play-service-account-dev.json')),
    },
    {
        label: 'apps/mobile/fastlane/play-service-account-prod.json',
        match: dir => exists(path.join(dir, 'apps/mobile/fastlane/play-service-account-prod.json')),
    },
    {
        label: 'apps/mobile/android/app/chatic-dou.keystore',
        match: dir => exists(path.join(dir, 'apps/mobile/android/app/chatic-dou.keystore')),
    },
];

function exists(file) {
    return fs.existsSync(file);
}

function listDir(dir) {
    try {
        return fs.readdirSync(dir);
    } catch {
        return [];
    }
}

function platformsFor(value) {
    if (!value || value === 'all') return PLATFORMS;
    if (!PLATFORMS.includes(value)) throw new Error(`platform must be all, ios or android (got ${value})`);
    return [value];
}

function missingKeys(root) {
    return KEY_FILES.filter(key => !key.match(root)).map(key => key.label);
}

async function preflight(ctx, deps) {
    const checks = [];
    const check = (name, ok, detail) => checks.push({ name, ok, detail });

    const branch = deps.git(['rev-parse', '--abbrev-ref', 'HEAD']);
    check(
        'branch',
        branch === ctx.branch,
        branch === ctx.branch ? branch : `on ${branch}; dev builds come from ${ctx.branch}`
    );

    const dirty = deps.git(['status', '--porcelain']);
    check('clean tree', dirty === '', dirty === '' ? 'clean' : 'commit or put aside local changes first');

    deps.git(['fetch', '--quiet', 'origin', ctx.branch, MOBILE_TAGS]);
    const head = deps.git(['rev-parse', 'HEAD']);
    const remote = deps.git(['rev-parse', `origin/${ctx.branch}`]);
    check(
        'matches origin',
        head === remote,
        head === remote ? head.slice(0, 9) : `HEAD ${head.slice(0, 9)} ≠ origin/${ctx.branch} ${remote.slice(0, 9)}`
    );

    const missing = missingKeys(deps.root);
    check(
        'deploy keys',
        missing.length === 0,
        missing.length === 0
            ? 'all five present'
            : `missing ${missing.join(', ')} — get them from the team secrets repository (apps/mobile/docs/release/deploy.md#keys)`
    );

    check('fastlane', deps.hasCommand('fastlane'), deps.hasCommand('fastlane') ? 'installed' : 'brew install fastlane');

    try {
        const runs = JSON.parse(
            await deps.gh(['run', 'list', '--workflow', RELEASE_WORKFLOW, '--limit', '20', '--json', 'status,url'])
        );
        const active = runs.filter(run => ACTIVE_RUN.includes(run.status));
        check(
            'no remote run',
            active.length === 0,
            active.length === 0 ? 'none in progress' : `in progress: ${active.map(run => run.url).join(' ')}`
        );
    } catch (error) {
        check('no remote run', true, `not checked (${error.message.split('\n')[0]})`);
    }

    const notes = checkStoreNotes(ctx.storeNotes);
    check('store notes', notes.ok, notes.ok ? `${notes.length}/500 characters` : notes.error);

    if (ctx.platforms.includes('ios')) {
        check(
            '/tmp/envfile',
            !deps.exists('/tmp/envfile'),
            deps.exists('/tmp/envfile') ? 'remove /tmp/envfile first' : 'absent'
        );
    }
    return checks;
}

function formatChecks(checks) {
    return checks.map(item => `${item.ok ? 'ok  ' : 'FAIL'}  ${item.name.padEnd(16)} ${item.detail}`).join('\n');
}

function uploadCommand(platform, env, storeNotes) {
    return ['./scripts/deploy-mobile.sh', platform, env, '-m', storeNotes];
}

async function releaseDev(options, deps) {
    const ctx = {
        branch: 'develop',
        platforms: platformsFor(options.platform),
        storeNotes: options.storeNotes || '',
    };
    const checks = await preflight(ctx, deps);
    deps.log(formatChecks(checks));
    const failed = checks.filter(item => !item.ok);

    const plan = await deps.plan({ bump: options.bump, version: options.version });
    deps.log(`\n${deps.summarize(plan)}`);
    const { version, build, tag } = plan.release;
    if (deps.tryGit(['rev-parse', '-q', '--verify', `refs/tags/${tag}`])) {
        failed.push({ name: 'tag', detail: `${tag} already exists` });
    }
    const env = { VERSION_NAME: version, BUILD_NUMBER: String(build) };
    const commands = ctx.platforms.map(platform => uploadCommand(platform, 'dev', ctx.storeNotes));

    if (options.dryRun) {
        deps.log('\nDry run — would run, in order, stopping at the first failure:');
        for (const command of commands) {
            deps.log(
                `  VERSION_NAME=${version} BUILD_NUMBER=${build} ${command.slice(0, 3).join(' ')} -m <store notes>`
            );
        }
        deps.log(`  git tag -a ${tag} ${plan.to.sha.slice(0, 9)} && git push origin refs/tags/${tag}`);
        deps.log(`  gh workflow run ${FINISH_WORKFLOW} -f tag=${tag}`);
        if (failed.length > 0) throw new Error(`Preflight failed: ${failed.map(item => item.name).join(', ')}`);
        return { plan, uploaded: [], dryRun: true };
    }
    if (failed.length > 0) throw new Error(`Preflight failed: ${failed.map(item => item.name).join(', ')}`);

    const uploaded = [];
    let failure = null;
    for (const [index, command] of commands.entries()) {
        const taken = buildTaken(deps, build);
        if (taken) {
            failure = `${taken} appeared while this run was going; build ${build} is taken`;
            break;
        }
        const status = deps.run(command[0], command.slice(1), env);
        if (status !== 0) {
            failure = `${ctx.platforms[index]} upload failed (exit ${status})`;
            break;
        }
        uploaded.push(ctx.platforms[index]);
    }
    if (uploaded.length === 0) throw new Error(`${failure}; nothing was uploaded, so no tag was made`);
    const clash = buildTaken(deps, build);
    if (clash) {
        throw new Error(
            `${clash} was pushed by another run after ${uploaded.join(', ')} uploaded build ${build}; ` +
                `not tagging. Note this upload on that release (apps/mobile/docs/release/deploy.md#release)`
        );
    }

    deps.git([
        'tag',
        '-a',
        '--cleanup=verbatim',
        tag,
        plan.to.sha,
        '-m',
        tagMessage({
            version,
            build,
            env: 'dev',
            platforms: uploaded,
            requested: ctx.platforms,
            sha: plan.to.sha,
            storeNotes: ctx.storeNotes,
        }),
    ]);
    deps.git(['push', 'origin', `refs/tags/${tag}`]);
    deps.log(`Pushed ${tag}`);
    await dispatchFinish(tag, options, deps);
    if (failure) throw new Error(`${failure} after ${uploaded.join(', ')} uploaded; ${tag} records only those`);
    return { plan, uploaded };
}

function buildTaken(deps, build) {
    deps.git(['fetch', '--quiet', 'origin', MOBILE_TAGS]);
    return (
        deps
            .git(['tag', '-l', 'mobile-v*'])
            .split('\n')
            .map(parseTag)
            .filter(Boolean)
            .find(tag => tag.build >= build)?.name || null
    );
}

async function dispatchFinish(tag, options, deps) {
    const args = ['workflow', 'run', FINISH_WORKFLOW, '--ref', options.ref || 'develop', '-f', `tag=${tag}`];
    if (options.teamNotes) args.push('-f', `team_notes=${options.teamNotes}`);
    try {
        await deps.gh(args);
        deps.log(`Started ${FINISH_WORKFLOW} for ${tag}: gh run list --workflow ${FINISH_WORKFLOW}`);
    } catch (error) {
        deps.log(
            `Could not start ${FINISH_WORKFLOW} (${error.message.split('\n')[0]}). Re-run: yarn mobile:release finish ${tag}`
        );
        throw error;
    }
}

async function finishTag(options, deps) {
    if (!parseTag(options.tag)) throw new Error('finish needs a mobile-v<version>-<build> tag');
    deps.git(['fetch', '--quiet', 'origin', MOBILE_TAGS]);
    if (!deps.tryGit(['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${options.tag}`])) {
        throw new Error(`${options.tag} is not on origin; finish runs after the tag is pushed`);
    }
    await dispatchFinish(options.tag, options, deps);
}

async function status(deps) {
    const tags = deps
        .git(['tag', '-l', 'mobile-v*', '--sort=-creatordate', '--format=%(refname:short) %(creatordate:short)'])
        .split('\n')
        .filter(Boolean)
        .slice(0, 10);
    deps.log(`Tags\n${tags.length ? tags.map(line => `  ${line}`).join('\n') : '  none'}`);
    for (const workflow of [RELEASE_WORKFLOW, FINISH_WORKFLOW]) {
        try {
            const runs = JSON.parse(
                await deps.gh([
                    'run',
                    'list',
                    '--workflow',
                    workflow,
                    '--limit',
                    '5',
                    '--json',
                    'status,conclusion,createdAt,url',
                ])
            );
            deps.log(
                `${workflow}\n${runs.length ? runs.map(run => `  ${run.createdAt} ${run.status} ${run.conclusion || ''} ${run.url}`).join('\n') : '  no runs'}`
            );
        } catch (error) {
            deps.log(`${workflow}\n  not readable (${error.message.split('\n')[0]})`);
        }
    }
}

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const options = { command };
    for (let i = 0; i < rest.length; i += 1) {
        const arg = rest[i];
        const value = () => {
            i += 1;
            if (rest[i] === undefined) throw new Error(`${arg} needs a value`);
            return rest[i];
        };
        if (arg === '--dry-run') options.dryRun = true;
        else if (arg === '--notes') options.storeNotes = value();
        else if (arg === '--notes-file') options.storeNotes = fs.readFileSync(value(), 'utf8');
        else if (arg === '--team-notes-file') options.teamNotes = fs.readFileSync(value(), 'utf8');
        else if (arg === '--bump') options.bump = value();
        else if (arg === '--version') options.version = value() || undefined;
        else if (arg === '--tag') options.tag = value();
        else if (arg === '--ref') options.ref = value();
        else if (!arg.startsWith('--') && command === 'finish' && !options.tag) options.tag = arg;
        else if (!arg.startsWith('--') && !options.platform) options.platform = arg;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

async function run(argv, deps) {
    const options = parseArgs(argv);
    if (options.command === 'dev') return releaseDev(options, deps);
    if (options.command === 'prod') {
        throw new Error('prod uploads arrive with release branches; use yarn mobile:deploy:prod for now');
    }
    if (options.command === 'finish') return finishTag(options, deps);
    if (options.command === 'status') return status(deps);
    throw new Error(`Unknown command: ${options.command}`);
}

const defaultDeps = {
    root: io.ROOT,
    git: io.git,
    tryGit: io.tryGit,
    gh: io.gh,
    exists,
    hasCommand: name => spawnSync('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' }).status === 0,
    run: (command, args, env) =>
        spawnSync(command, args, { cwd: io.ROOT, stdio: 'inherit', env: { ...process.env, ...env } }).status,
    plan: options => {
        const plan = require('./plan');
        return plan.buildPlan(options, plan.defaultDeps);
    },
    summarize: plan => require('./plan').summarize(plan),
    log: message => console.log(message),
};

module.exports = {
    buildTaken,
    KEY_FILES,
    missingKeys,
    platformsFor,
    preflight,
    formatChecks,
    releaseDev,
    finishTag,
    status,
    parseArgs,
    run,
    defaultDeps,
};
