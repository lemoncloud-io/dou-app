#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const io = require('./io');
const { readGradleVersion, CONFIG } = require('../version-mobile');
const { parseConventional, categoryOf, highestCategory, isLegacyVersionBump, proposeUnit } = require('./commits');
const { mobileDependencyRoots, allProjectRoots, binaryRoots, reachesBinary } = require('./paths');
const { nativeSignals } = require('./signals');
const {
    parseTag,
    latestTag,
    nextBuildNumber,
    resolveUnit,
    resolveVersion,
    compareVersions,
    tagName,
    bumpVersion,
    parseReleaseBranch,
} = require('./version');
const { parseReplacers, teamNotes } = require('./notes');

const RECORD = '\x1e';
const FIELD = '\x1f';
const RELEASE_DRAFTER = '.github/release-drafter.yml';

function readCommits(deps, range) {
    const raw = deps.git([
        'log',
        '--no-merges',
        '--name-only',
        `--format=${RECORD}%H${FIELD}%an${FIELD}%s${FIELD}%b${FIELD}`,
        range,
    ]);
    return raw
        .split(RECORD)
        .filter(chunk => chunk.trim())
        .map(chunk => {
            const [sha, author, subject, body, names] = chunk.split(FIELD);
            const files = (names || '')
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean);
            return { sha, author, subject, body: body.trim(), files };
        });
}

function classify(raw, roots, otherRoots = []) {
    const binaryFiles = raw.files.filter(file => reachesBinary(file, roots, otherRoots));
    const { type, breaking } = parseConventional(raw.subject, raw.body);
    return {
        sha: raw.sha,
        author: raw.author,
        subject: raw.subject,
        type,
        breaking,
        category: categoryOf({ type, breaking }),
        binaryFiles,
        inBinary: binaryFiles.length > 0 && !isLegacyVersionBump(raw.subject),
    };
}

function pickPr(pulls, baseRef) {
    const merged = pulls.filter(pull => pull.merged_at);
    if (merged.length === 0) return null;
    const onBase = merged.filter(pull => pull.base && pull.base.ref === baseRef);
    const pool = onBase.length > 0 ? onBase : merged;
    const pull = pool.sort((a, b) => a.merged_at.localeCompare(b.merged_at))[0];
    return { number: pull.number, title: pull.title, author: pull.user && pull.user.login, url: pull.html_url };
}

async function lookupPrs(deps, commits, baseRef) {
    const repo = deps.repoSlug();
    await deps.mapLimit(commits, 8, async commit => {
        const out = await deps.gh(['api', `repos/${repo}/commits/${commit.sha}/pulls`]);
        commit.pr = pickPr(JSON.parse(out || '[]'), baseRef);
    });
}

function groupPrs(commits) {
    const byNumber = new Map();
    for (const commit of commits.filter(item => item.pr)) {
        const entry = byNumber.get(commit.pr.number) || { ...commit.pr, commits: [], categories: [] };
        entry.commits.push(commit.sha);
        entry.categories.push(commit.category);
        byNumber.set(commit.pr.number, entry);
    }
    return [...byNumber.values()]
        .map(({ categories, ...pr }) => ({ ...pr, category: highestCategory(categories) }))
        .sort((a, b) => a.number - b.number);
}

async function prodTags(deps) {
    try {
        const out = await deps.gh(['release', 'list', '--limit', '1000', '--json', 'tagName,isPrerelease,isDraft']);
        return JSON.parse(out)
            .filter(release => !release.isPrerelease && !release.isDraft && parseTag(release.tagName))
            .map(release => release.tagName);
    } catch (error) {
        if (process.env.CI) throw new Error(`Could not read GitHub releases: ${error.message}`);
        deps.warn(`Could not read GitHub releases (${error.message}); treating every mobile tag as dev-only.`);
        return [];
    }
}

function resolveBase(deps, gradle, prod, to) {
    const last = latestTag(prod);
    if (last) {
        return {
            version: last.version,
            source: 'prod-release',
            ref: last.name,
            commit: deps.git(['rev-list', '-n', '1', last.name]),
        };
    }
    const commit = deps.git([
        'log',
        '-1',
        '--format=%H',
        `-SversionName "${gradle.versionName}"`,
        to,
        '--',
        CONFIG.gradlePath,
    ]);
    if (!commit) {
        throw new Error(`Cannot find the commit that set versionName ${gradle.versionName} in ${CONFIG.gradlePath}`);
    }
    return { version: gradle.versionName, source: 'build.gradle', ref: commit.slice(0, 9), commit };
}

async function buildPlan(options, deps) {
    const built = options.forTag ? parseTag(options.forTag) : null;
    if (options.forTag && !built) throw new Error(`${options.forTag} is not a mobile-v<version>-<build> tag`);
    if (options.env === 'prod' && !built) throw new Error('plan --env prod needs --tag <the dev build to ship>');
    const to = built ? built.name : options.to || 'HEAD';
    const toSha = deps.git(['rev-parse', `${to}^{commit}`]);
    const gradle = readGradleVersion(deps.git(['show', `${toSha}:${CONFIG.gradlePath}`]));
    const others = name => !built || name !== built.name;
    const allTags = deps.git(['tag', '-l', 'mobile-v*']).split('\n').filter(Boolean).filter(others);
    const reachableTags = deps
        .git(['tag', '-l', 'mobile-v*', '--merged', toSha])
        .split('\n')
        .filter(Boolean)
        .filter(others);
    const prod = (options.prodTags || (await prodTags(deps)))
        .filter(others)
        .filter(name => !built || parseTag(name).build < built.build);
    const base = resolveBase(deps, gradle, prod, toSha);
    const lastTag = latestTag(reachableTags);

    const unitFrom = options.from ? deps.git(['rev-parse', `${options.from}^{commit}`]) : base.commit;
    let notesFrom = base.commit;
    if (options.from) notesFrom = unitFrom;
    else if (options.env !== 'prod' && lastTag) notesFrom = deps.git(['rev-list', '-n', '1', lastTag.name]);

    const graph = options.libRoots ? null : deps.nxGraph();
    const roots = binaryRoots(options.libRoots || mobileDependencyRoots(graph));
    const otherRoots = (options.projectRoots || (graph ? allProjectRoots(graph) : [])).filter(
        root => !roots.includes(`${root.replace(/\/+$/, '')}/`)
    );
    const unitCommits = readCommits(deps, `${unitFrom}..${toSha}`)
        .map(raw => classify(raw, roots, otherRoots))
        .filter(c => c.inBinary);
    const notesShas = new Set(
        notesFrom === unitFrom
            ? unitCommits.map(c => c.sha)
            : readCommits(deps, `${notesFrom}..${toSha}`).map(c => c.sha)
    );
    const notesCommits = unitCommits.filter(commit => notesShas.has(commit.sha));

    const signals = unitCommits.length > 0 ? nativeSignals(deps, unitFrom, toSha) : [];
    if (options.prs !== false) await lookupPrs(deps, unitCommits, options.baseRef || 'develop');
    const prBySha = new Map(unitCommits.filter(c => c.pr).map(c => [c.sha, c.pr.number]));
    for (const signal of signals) signal.pr = prBySha.get(signal.sha) || null;

    const prs = groupPrs(notesCommits);
    const directCommits = notesCommits.filter(commit => !commit.pr);
    const replacers = parseReplacers(deps.readFile(RELEASE_DRAFTER));
    const proposed = proposeUnit(unitCommits, signals);
    const devTags = reachableTags.filter(name => compareVersions(parseTag(name).version, base.version) > 0);
    const hotfix = built ? null : parseReleaseBranch(options.branch);
    let unit;
    let version;
    if (built) {
        unit = unitBetween(base.version, built.version);
        version = built.version;
    } else if (hotfix) {
        ({ unit, version } = hotfixVersion(hotfix, reachableTags, options));
    } else {
        unit = resolveUnit(proposed.unit, options.bump);
        version = resolveVersion({ base: base.version, unit, devTags, requested: options.version });
    }
    const store = options.storeBuild === undefined || options.storeBuild === null ? null : Number(options.storeBuild);
    const computed = nextBuildNumber(allTags, Math.max(gradle.versionCode, store || 0));
    const build = built ? built.build : resolveBuild(computed, options.build);

    return {
        repo: options.prs === false ? null : deps.repoSlug(),
        to: { ref: to, sha: toSha },
        base,
        lastTag: lastTag ? lastTag.name : null,
        env: options.env === 'prod' ? 'prod' : 'dev',
        ranges: { unit: `${unitFrom}..${toSha}`, notes: `${notesFrom}..${toSha}` },
        binaryRoots: roots,
        otherRoots,
        proposal: {
            unit: proposed.unit,
            autoUnit: resolveUnit(proposed.unit, 'auto'),
            reasons: proposed.reasons,
            featCommits: proposed.featCommits || 0,
        },
        signals,
        release: {
            unit,
            version,
            build,
            tag: tagName(version, build),
            branch: built ? null : options.branch || 'develop',
            buildBasis: { tags: latestBuild(allTags), store, gradle: gradle.versionCode, computed },
        },
        commits: notesCommits.map(({ binaryFiles, inBinary: _inBinary, ...rest }) => ({ ...rest, files: binaryFiles })),
        prs,
        teamNotes: teamNotes(prs, directCommits, replacers),
        cardNotes: teamNotes(prs, directCommits, replacers, 'ko'),
    };
}

function hotfixVersion(branch, reachableTags, options) {
    if (options.version) throw new Error(`${branch.name} builds take the next patch; drop --version`);
    if (options.bump && !['auto', 'patch'].includes(options.bump)) {
        throw new Error(`${branch.name} builds are always patch (got --bump ${options.bump})`);
    }
    const sameMinor = reachableTags.map(parseTag).filter(tag => {
        const [major, minor] = tag.version.split('.').map(Number);
        return major === branch.major && minor === branch.minor;
    });
    if (sameMinor.length === 0) {
        throw new Error(`${branch.name} has no mobile-v${branch.major}.${branch.minor}.* tag to build a patch on`);
    }
    const last = sameMinor.map(tag => tag.version).reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b));
    return { unit: 'patch', version: bumpVersion(last, 'patch') };
}

function latestBuild(tags) {
    const last = latestTag(tags);
    return last ? last.build : null;
}

function resolveBuild(computed, requested) {
    if (requested === undefined || requested === null || requested === '') return computed;
    if (!/^\d+$/.test(String(requested))) throw new Error(`build must be a whole number (got ${requested})`);
    const value = Number(requested);
    if (value < computed) {
        throw new Error(`build ${value} is below ${computed}, the next free number from the tags and the store`);
    }
    return value;
}

function proposalReason(proposal) {
    const reasons = proposal.reasons;
    const prs = list => {
        const numbers = [...new Set(list.map(item => item.pr).filter(Boolean))];
        return numbers.length ? `, PR ${numbers.map(n => `#${n}`).join(' ')}` : '';
    };
    if (proposal.unit === null) return 'no commit reached the binary';
    if (proposal.unit === 'patch') {
        return `no native signal (${proposal.featCommits} feat commit(s) count as patch)`;
    }
    if (proposal.unit === 'major') return `${reasons.length} breaking commit(s)${prs(reasons)}`;
    return `${reasons.map(item => `${item.detail} (${item.file})`).join('; ')}${prs(reasons)}`;
}

function buildLine(release) {
    const basis = release.buildBasis;
    if (!basis) return `${release.build}`;
    const parts = [`tags ${basis.tags === null ? 'none' : basis.tags}`, `gradle ${basis.gradle}`];
    parts.push(basis.store === null ? 'store not read' : `store ${basis.store}`);
    const manual = release.build !== basis.computed ? `, set by hand (next free ${basis.computed})` : '';
    return `${release.build} (highest of ${parts.join(', ')}, plus one${manual})`;
}

function unitBetween(from, to) {
    const [a, b] = [from, to].map(version => version.split('.').map(Number));
    if (b[0] !== a[0]) return 'major';
    if (b[1] !== a[1]) return 'minor';
    return b[2] !== a[2] ? 'patch' : 'build';
}

function summarize(plan) {
    const rows = [
        ['Base', `${plan.base.version} (${plan.base.source} ${plan.base.ref})`],
        ['Last tag', plan.lastTag || 'none'],
        [
            'Proposal',
            `${plan.proposal.unit || 'none'}${plan.proposal.unit === 'major' ? ' (auto ships minor)' : ''} — ${proposalReason(plan.proposal)}`,
        ],
        [
            'Release',
            `${plan.release.version} ${plan.release.unit} → ${plan.release.tag}${plan.release.branch && plan.release.branch !== 'develop' ? ` (release branch ${plan.release.branch}, patch only)` : ''}`,
        ],
        ['Build', buildLine(plan.release)],
        ['Notes range', `${plan.ranges.notes}${plan.env === 'prod' ? ' (since the last prod release)' : ''}`],
        ['PRs', `${plan.prs.length} PR(s), ${plan.commits.filter(c => !c.pr).length} commit(s) without a PR`],
    ];
    const width = Math.max(...rows.map(([label]) => label.length));
    return `${rows.map(([label, value]) => `${label.padEnd(width)}  ${value}`).join('\n')}\n\n${plan.teamNotes}\n`;
}

function parseArgs(argv) {
    const options = { json: false, prs: true };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const value = () => {
            i += 1;
            if (argv[i] === undefined) throw new Error(`${arg} needs a value`);
            return argv[i];
        };
        if (arg === '--json') options.json = true;
        else if (arg === '--no-prs') options.prs = false;
        else if (arg === '--from') options.from = value();
        else if (arg === '--to') options.to = value();
        else if (arg === '--for-tag' || arg === '--tag') options.forTag = value();
        else if (arg === '--env') options.env = value();
        else if (arg === '--bump') options.bump = value();
        else if (arg === '--version') options.version = value() || undefined;
        else if (arg === '--build') options.build = value() || undefined;
        else if (arg === '--store-build') options.storeBuild = Number(value());
        else if (arg === '--base-ref') options.baseRef = value();
        else if (arg === '--branch') options.branch = value();
        else if (arg === '--out') options.out = value();
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

const defaultDeps = {
    git: io.git,
    tryGit: io.tryGit,
    gh: io.gh,
    repoSlug: io.repoSlug,
    nxGraph: io.nxGraph,
    mapLimit: io.mapLimit,
    readFile: file => fs.readFileSync(path.join(io.ROOT, file), 'utf8'),
    warn: message => console.error(message),
};

async function main(argv) {
    const options = parseArgs(argv);
    const plan = await buildPlan(options, defaultDeps);
    const output = options.json ? `${JSON.stringify(plan, null, 2)}\n` : summarize(plan);
    if (options.out) fs.writeFileSync(options.out, output);
    else process.stdout.write(output);
}

io.runMain(module, main);

module.exports = {
    unitBetween,
    resolveBuild,
    proposalReason,
    readCommits,
    classify,
    pickPr,
    groupPrs,
    buildPlan,
    summarize,
    parseArgs,
    main,
    defaultDeps,
};
