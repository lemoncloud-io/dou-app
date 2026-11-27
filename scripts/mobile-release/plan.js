#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const io = require('./io');
const { readGradleVersion, CONFIG } = require('../version-mobile');
const { parseConventional, categoryOf, highestCategory, isLegacyVersionBump, proposeUnit } = require('./commits');
const {
    MOBILE_PACKAGE_JSON,
    mobileDependencyRoots,
    allProjectRoots,
    binaryRoots,
    reachesBinary,
    isNativeFile,
    addedDependencies,
} = require('./paths');
const {
    parseTag,
    latestTag,
    nextBuildNumber,
    resolveUnit,
    resolveVersion,
    compareVersions,
    tagName,
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

function classify(deps, raw, roots, otherRoots = []) {
    const binaryFiles = raw.files.filter(file => reachesBinary(file, roots, otherRoots));
    const { type, breaking } = parseConventional(raw.subject, raw.body);
    let native = binaryFiles.some(isNativeFile);
    if (!native && raw.files.includes(MOBILE_PACKAGE_JSON)) {
        const before = deps.tryGit(['show', `${raw.sha}^:${MOBILE_PACKAGE_JSON}`]);
        const after = deps.tryGit(['show', `${raw.sha}:${MOBILE_PACKAGE_JSON}`]);
        native = addedDependencies(before, after).length > 0;
    }
    return {
        sha: raw.sha,
        author: raw.author,
        subject: raw.subject,
        type,
        breaking,
        native,
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
    const notesFrom = options.from ? unitFrom : lastTag ? deps.git(['rev-list', '-n', '1', lastTag.name]) : base.commit;

    const graph = options.libRoots ? null : deps.nxGraph();
    const roots = binaryRoots(options.libRoots || mobileDependencyRoots(graph));
    const otherRoots = (options.projectRoots || (graph ? allProjectRoots(graph) : [])).filter(
        root => !roots.includes(`${root.replace(/\/+$/, '')}/`)
    );
    const unitCommits = readCommits(deps, `${unitFrom}..${toSha}`)
        .map(raw => classify(deps, raw, roots, otherRoots))
        .filter(c => c.inBinary);
    const notesShas = new Set(
        notesFrom === unitFrom
            ? unitCommits.map(c => c.sha)
            : readCommits(deps, `${notesFrom}..${toSha}`).map(c => c.sha)
    );
    const notesCommits = unitCommits.filter(commit => notesShas.has(commit.sha));

    if (options.prs !== false) await lookupPrs(deps, unitCommits, options.baseRef || 'develop');

    const prs = groupPrs(notesCommits);
    const directCommits = notesCommits.filter(commit => !commit.pr);
    const replacers = parseReplacers(deps.readFile(RELEASE_DRAFTER));
    const proposed = proposeUnit(unitCommits);
    const devTags = reachableTags.filter(name => compareVersions(parseTag(name).version, base.version) > 0);
    const unit = built ? unitBetween(base.version, built.version) : resolveUnit(proposed.unit, options.bump);
    const version = built
        ? built.version
        : resolveVersion({ base: base.version, unit, devTags, requested: options.version });
    const build = built ? built.build : nextBuildNumber(allTags, gradle.versionCode);

    return {
        repo: options.prs === false ? null : deps.repoSlug(),
        to: { ref: to, sha: toSha },
        base,
        lastTag: lastTag ? lastTag.name : null,
        ranges: { unit: `${unitFrom}..${toSha}`, notes: `${notesFrom}..${toSha}` },
        binaryRoots: roots,
        otherRoots,
        proposal: { unit: proposed.unit, autoUnit: resolveUnit(proposed.unit, 'auto'), reasons: proposed.reasons },
        release: { unit, version, build, tag: tagName(version, build) },
        commits: notesCommits.map(({ binaryFiles, inBinary: _inBinary, ...rest }) => ({ ...rest, files: binaryFiles })),
        prs,
        teamNotes: teamNotes(prs, directCommits, replacers),
    };
}

function unitBetween(from, to) {
    const [a, b] = [from, to].map(version => version.split('.').map(Number));
    if (b[0] !== a[0]) return 'major';
    if (b[1] !== a[1]) return 'minor';
    return b[2] !== a[2] ? 'patch' : 'build';
}

function summarize(plan) {
    const reasons = plan.proposal.reasons;
    const prNumbers = [...new Set(reasons.map(item => item.pr).filter(Boolean))];
    const why =
        reasons.length === 0
            ? 'no commits reached the binary'
            : `${reasons.length} ${reasons[0].why} commit(s)${prNumbers.length ? `, PR ${prNumbers.map(n => `#${n}`).join(' ')}` : ''}`;
    const rows = [
        ['Base', `${plan.base.version} (${plan.base.source} ${plan.base.ref})`],
        ['Last tag', plan.lastTag || 'none'],
        [
            'Proposal',
            `${plan.proposal.unit || 'none'}${plan.proposal.unit === 'major' ? ' (auto ships minor)' : ''} — ${why}`,
        ],
        ['Release', `${plan.release.version} (${plan.release.build}) ${plan.release.unit} → ${plan.release.tag}`],
        ['Notes range', plan.ranges.notes],
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
        else if (arg === '--for-tag') options.forTag = value();
        else if (arg === '--bump') options.bump = value();
        else if (arg === '--version') options.version = value() || undefined;
        else if (arg === '--base-ref') options.baseRef = value();
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
