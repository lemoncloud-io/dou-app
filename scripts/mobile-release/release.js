#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const io = require('./io');
const { checkStoreNotes } = require('./notes');
const { tagMessage, parseTagMessage } = require('./finish');
const { parseTag } = require('./version');
const store = require('./store');

const PLATFORMS = ['ios', 'android'];
const RELEASE_WORKFLOW = 'mobile-release.yml';
const FINISH_WORKFLOW = 'mobile-release-finish.yml';
const MOBILE_TAGS = 'refs/tags/mobile-v*:refs/tags/mobile-v*';
const ACTIVE_RUN = ['queued', 'in_progress', 'waiting', 'pending', 'requested'];

const fastlaneFile = name => ({
    label: `apps/mobile/fastlane/${name}`,
    match: dir => exists(path.join(dir, 'apps/mobile/fastlane', name)),
});

const KEYS = {
    env: fastlaneFile('.env'),
    ascKey: {
        label: 'apps/mobile/fastlane/AuthKey_*.p8',
        match: dir => listDir(path.join(dir, 'apps/mobile/fastlane')).some(name => /^AuthKey_.+\.p8$/.test(name)),
    },
    playDev: fastlaneFile('play-service-account-dev.json'),
    playProd: fastlaneFile('play-service-account-prod.json'),
    keystore: {
        label: 'apps/mobile/android/app/chatic-dou.keystore',
        match: dir => exists(path.join(dir, 'apps/mobile/android/app/chatic-dou.keystore')),
    },
};

function requiredKeys(env, platforms) {
    const keys = [KEYS.env];
    if (platforms.includes('ios')) keys.push(KEYS.ascKey);
    if (platforms.includes('android')) keys.push(env === 'prod' ? KEYS.playProd : KEYS.playDev, KEYS.keystore);
    return keys;
}

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

function missingKeys(root, env, platforms) {
    return requiredKeys(env, platforms)
        .filter(key => !key.match(root))
        .map(key => key.label);
}

async function preflight(ctx, deps) {
    const checks = [];
    const check = (name, ok, detail) => checks.push({ name, ok, detail });

    const dirty = deps.git(['status', '--porcelain']);
    const head = deps.git(['rev-parse', 'HEAD']);
    if (ctx.retry) {
        deps.git(['fetch', '--quiet', 'origin', MOBILE_TAGS]);
        const at = ctx.retry.sha;
        check(
            'at the tag',
            head === at,
            head === at ? `${ctx.retry.tag} ${at.slice(0, 9)}` : `run git switch --detach ${ctx.retry.tag} first`
        );
    } else {
        const branch = deps.git(['rev-parse', '--abbrev-ref', 'HEAD']);
        check(
            'branch',
            branch === ctx.branch,
            branch === ctx.branch ? branch : `on ${branch}; dev builds come from ${ctx.branch}`
        );
        deps.git(['fetch', '--quiet', 'origin', ctx.branch, MOBILE_TAGS]);
        const remote = deps.git(['rev-parse', `origin/${ctx.branch}`]);
        check(
            'matches origin',
            head === remote,
            head === remote ? head.slice(0, 9) : `HEAD ${head.slice(0, 9)} ≠ origin/${ctx.branch} ${remote.slice(0, 9)}`
        );
    }
    check('clean tree', dirty === '', dirty === '' ? 'clean' : 'commit or put aside local changes first');

    const missing = missingKeys(deps.root, ctx.env, ctx.platforms);
    check(
        'deploy keys',
        missing.length === 0,
        missing.length === 0
            ? `present for ${ctx.platforms.join(', ')} ${ctx.env}`
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

function retryTarget(tagName, platform, deps) {
    if (!parseTag(tagName)) throw new Error(`--tag needs a mobile-v<version>-<build> tag (got ${tagName})`);
    deps.git(['fetch', '--quiet', 'origin', MOBILE_TAGS]);
    const sha = deps.tryGit(['rev-list', '-n', '1', tagName]);
    if (!sha) throw new Error(`${tagName} does not exist on origin`);
    const recorded = parseTagMessage(deps.git(['tag', '-l', '--format=%(contents)', tagName]));
    if (recorded.env !== 'dev') throw new Error(`${tagName} is a ${recorded.env} build; dev --tag retries dev builds`);
    const wanted = platform ? platformsFor(platform) : PLATFORMS;
    const onStore = store.uploadedPlatforms(recorded.results);
    const missing = wanted.filter(name => !onStore.includes(name));
    return { tag: tagName, sha, ...parseTag(tagName), recorded, missing };
}

function describePlan(plan, deps) {
    deps.log(`\n${deps.summarize(plan)}`);
}

async function releaseDev(options, deps) {
    const retry = options.tag ? retryTarget(options.tag, options.platform, deps) : null;
    const ctx = {
        branch: 'develop',
        env: 'dev',
        retry,
        platforms: retry ? retry.missing : platformsFor(options.platform),
        storeNotes: options.storeNotes || (retry ? retry.recorded.storeNotes : ''),
    };
    if (retry && ctx.platforms.length === 0) {
        throw new Error(`${retry.tag} already records every requested platform as uploaded; nothing to retry`);
    }
    const checks = await preflight(ctx, deps);
    deps.log(formatChecks(checks));
    const failed = checks.filter(item => !item.ok);

    const storeCommands = ctx.platforms.map(platform => {
        const [command, args] = store.storeBuildCommand(platform, 'dev', '<file>');
        return `(cd apps/mobile && ${command} ${args.join(' ')})`;
    });
    if (options.dryRun) {
        let target;
        if (retry) {
            target = { version: retry.version, build: retry.build, tag: retry.tag, sha: retry.sha };
            deps.log(`\nRetry ${retry.tag}: upload ${ctx.platforms.join(', ')} at ${retry.version} (${retry.build})`);
        } else {
            const plan = await deps.plan({ bump: options.bump, version: options.version, build: options.build });
            describePlan(plan, deps);
            target = { ...plan.release, sha: plan.to.sha };
        }
        deps.log('\nDry run — would run, in order, stopping at the first failure:');
        if (!retry) {
            deps.log('  read the latest store build numbers (not read in a dry run):');
            for (const line of storeCommands) deps.log(`    ${line}`);
        }
        for (const platform of ctx.platforms) {
            const command = uploadCommand(platform, 'dev', ctx.storeNotes);
            deps.log(
                `  VERSION_NAME=${target.version} BUILD_NUMBER=${target.build} ${command.slice(0, 3).join(' ')} -m <store notes>`
            );
        }
        if (!retry) {
            deps.log(`  git tag -a ${target.tag} ${target.sha.slice(0, 9)} && git push origin refs/tags/${target.tag}`);
        }
        deps.log(`  gh workflow run ${FINISH_WORKFLOW} -f tag=${target.tag}${retry ? ' -f platform=<results>' : ''}`);
        if (failed.length > 0) throw new Error(`Preflight failed: ${failed.map(item => item.name).join(', ')}`);
        return { dryRun: true, uploaded: [] };
    }
    if (failed.length > 0) throw new Error(`Preflight failed: ${failed.map(item => item.name).join(', ')}`);

    let target;
    let plan = null;
    if (retry) {
        target = { version: retry.version, build: retry.build, tag: retry.tag, sha: retry.sha };
    } else {
        const floor = store.storeFloor(ctx.platforms, 'dev', deps.store);
        deps.log(`Store build numbers: ${store.formatResults(floor.byPlatform)}`);
        plan = await deps.plan({
            bump: options.bump,
            version: options.version,
            build: options.build,
            storeBuild: floor.max,
        });
        describePlan(plan, deps);
        target = { ...plan.release, sha: plan.to.sha };
        if (deps.tryGit(['rev-parse', '-q', '--verify', `refs/tags/${target.tag}`])) {
            throw new Error(`${target.tag} already exists`);
        }
    }

    const env = { VERSION_NAME: target.version, BUILD_NUMBER: String(target.build) };
    const outcomes = {};
    let stop = null;
    for (const platform of ctx.platforms) {
        if (stop) break;
        if (!retry) {
            const taken = buildTaken(deps, target.build);
            if (taken) {
                stop = `${taken} appeared while this run was going; build ${target.build} is taken`;
                break;
            }
        }
        const command = uploadCommand(platform, 'dev', ctx.storeNotes);
        const status = deps.run(command[0], command.slice(1), env);
        outcomes[platform] = status === 0 ? 'success' : 'failure';
        if (status !== 0) stop = `${platform} upload failed (exit ${status})`;
    }
    const results = store.resolveResults(
        { requested: ctx.platforms, outcomes, env: 'dev', build: target.build },
        deps.store
    );
    deps.log(`Results: ${store.formatResults(results)}`);
    const uploaded = store.uploadedPlatforms(results);
    if (uploaded.length === 0) {
        throw new Error(
            `${stop || 'nothing uploaded'}; nothing reached the store, so ${retry ? 'nothing changed' : 'no tag was made'}`
        );
    }

    if (retry) {
        const merged = store.mergeResults(retry.recorded.results, results);
        await dispatchFinish(retry.tag, { ...options, platformResults: store.formatResults(merged) }, deps);
    } else {
        const clash = buildTaken(deps, target.build);
        if (clash) {
            throw new Error(
                `${clash} was pushed by another run after ${uploaded.join(', ')} uploaded build ${target.build}; ` +
                    `not tagging. Note this upload on that release (apps/mobile/docs/release/deploy.md#release)`
            );
        }
        deps.git([
            'tag',
            '-a',
            '--cleanup=verbatim',
            target.tag,
            target.sha,
            '-m',
            tagMessage({
                version: target.version,
                build: target.build,
                env: 'dev',
                results,
                sha: target.sha,
                storeNotes: ctx.storeNotes,
            }),
        ]);
        deps.git(['push', 'origin', `refs/tags/${target.tag}`]);
        deps.log(`Pushed ${target.tag}`);
        await dispatchFinish(target.tag, options, deps);
    }
    const incomplete = Object.keys(results).filter(platform => results[platform] === 'incomplete');
    const problems = [
        stop,
        ...incomplete.map(platform => `${platform} reached the store but its lane failed; check the store notes`),
    ].filter(Boolean);
    if (problems.length > 0) {
        throw new Error(`${problems.join('; ')}. ${target.tag} records ${store.formatResults(results)}`);
    }
    return { plan, uploaded, results };
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
    if (options.platformResults) args.push('-f', `platform=${options.platformResults}`);
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
        else if (arg === '--build') options.build = value() || undefined;
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
    store: store.defaultDeps,
    log: message => console.log(message),
};

module.exports = {
    buildTaken,
    KEYS,
    requiredKeys,
    missingKeys,
    retryTarget,
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
