#!/usr/bin/env node
/**
 * Take a stack copied out of admin-v2 and print it as repo-relative
 * `path:line:col` frames — which an IDE terminal turns into clickable links, so
 * a report goes from the admin list to the editor in one command.
 *
 *   yarn trace                      # reads the clipboard (admin-v2 "IDE로 추적")
 *   pbpaste | yarn trace            # or stdin
 *   yarn trace --map <file.js.map>  # a map already on disk; skips the lookup
 *   yarn trace --project admin-v2   # override the app→project guess
 *
 * Why this exists: `scripts/resolve-stack.js` already undoes minification, but
 * feeding it means finding the deploy run, downloading its artifact, and
 * picking the map whose bundle hash matches the trace. Those three steps are
 * the same every time, and getting the last one wrong resolves to plausible but
 * wrong lines rather than failing.
 *
 * Maps are not deployed — serving them publishes the sources through
 * `sourcesContent` — so they come from the `sourcemaps-<project>-<sha>`
 * artifact every deploy archives. What is downloaded is cached under
 * `.sourcemaps/` (gitignored) by bundle name. That name is content-hashed, so
 * a name match is an exact build match and the cache cannot serve a map from
 * some other build.
 *
 * Manual: docs/guides/trace-report.md · design: libs/web-core/docs/error-reporting.md
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { readBundleNames, resolveStack } = require('./resolve-stack');

const REPO_ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(REPO_ROOT, '.sourcemaps');

// A report you are triaging came from a recent deploy. Needing to walk further
// back than this means the map was never archived or has aged out of the 30-day
// retention — not that it sits a few more runs down.
const MAX_CANDIDATES = 5;

// A report names the app it came from; CI names artifacts after the project
// that built the bundle. Mobile is a WebView over the web build, so both are
// served by the same maps.
const PROJECT_BY_APP = { web: 'web', mobile: 'web', desktop: 'desktop-web' };

const USAGE = `usage: yarn trace [--map <file.js.map>] [--project <name>]

  admin-v2 리포트 상세의 "IDE로 추적"으로 복사한 뒤 인자 없이 실행하면 된다.
  스택을 stdin으로 넘겨도 동작한다: pbpaste | yarn trace

  메뉴얼: docs/guides/trace-report.md`;

const fail = message => {
    process.stderr.write(`${message}\n`);
    process.exit(1);
};

const parseArgs = argv => {
    const options = {};

    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--map') options.map = argv[(i += 1)];
        else if (argv[i] === '--project') options.project = argv[(i += 1)];
        else if (argv[i] === '--help' || argv[i] === '-h') options.help = true;
        else return fail(`알 수 없는 옵션: ${argv[i]}\n\n${USAGE}`);
    }

    return options;
};

const readInput = () => {
    if (!process.stdin.isTTY) return fs.readFileSync(0, 'utf8');
    if (process.platform !== 'darwin') fail(`클립보드를 읽을 수 없는 환경이다. 스택을 파이프로 넘겨라.\n\n${USAGE}`);

    return execFileSync('pbpaste', { encoding: 'utf8' });
};

// The header the admin copy button prepends: `# chatic-report app=web at=...`.
const HEADER = /^#\s*chatic-report\s+(.*)$/m;

/** Splits the copied blob into its `key=value` header and the stack itself. */
const parseReport = input => {
    const header = input.match(HEADER);
    const meta = {};

    for (const pair of header ? header[1].trim().split(/\s+/) : []) {
        const separator = pair.indexOf('=');
        if (separator > 0) meta[pair.slice(0, separator)] = pair.slice(separator + 1);
    }

    return { meta, stack: input.replace(HEADER, '').trim() };
};

const gh = args => {
    try {
        // Maps run large; a 5MB artifact listing is well inside this.
        return execFileSync('gh', args, {
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch (error) {
        return fail(`gh 실행 실패: ${(error.stderr || error.message).toString().trim()}`);
    }
};

/**
 * Candidate artifacts, newest first. `notAfter` is the report's own timestamp —
 * the build that served it cannot postdate the error it produced, so dropping
 * later runs keeps a busy deploy day from spending the whole candidate budget
 * on artifacts from after the fact.
 */
const findArtifacts = (project, notAfter) => {
    const prefix = `sourcemaps-${project}-`;
    const listing = gh([
        'api',
        'repos/{owner}/{repo}/actions/artifacts?per_page=100',
        '--jq',
        '.artifacts[] | {name, createdAt: .created_at, expired, runId: .workflow_run.id}',
    ]);

    return listing
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line))
        .filter(artifact => !artifact.expired && artifact.name.startsWith(prefix))
        .filter(artifact => !notAfter || Date.parse(artifact.createdAt) <= notAfter)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
};

const walk = dir =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
    });

/** Downloads one artifact and files every map it holds under its bundle name. */
const cacheArtifact = artifact => {
    const into = fs.mkdtempSync(path.join(os.tmpdir(), 'chatic-sourcemaps-'));

    try {
        gh(['run', 'download', String(artifact.runId), '-n', artifact.name, '-D', into]);
        for (const file of walk(into)) {
            if (file.endsWith('.map')) fs.copyFileSync(file, path.join(CACHE_DIR, path.basename(file)));
        }
    } finally {
        fs.rmSync(into, { recursive: true, force: true });
    }
};

/** The map for `bundle`, from the cache or the newest artifact that holds it. */
const findMap = (bundle, project, notAfter) => {
    const cached = path.join(CACHE_DIR, `${bundle}.map`);
    if (fs.existsSync(cached)) return { path: cached, from: '캐시' };

    const artifacts = findArtifacts(project, notAfter);
    if (!artifacts.length) {
        process.stderr.write(
            `  sourcemaps-${project}-* 아티팩트가 없다 (배포가 맵을 보관하지 않았거나 30일이 지났다).\n`
        );
        return null;
    }

    for (const artifact of artifacts.slice(0, MAX_CANDIDATES)) {
        process.stderr.write(`  ${artifact.name} 확인 중...\n`);
        cacheArtifact(artifact);
        if (fs.existsSync(cached)) return { path: cached, from: artifact.name };
    }

    return null;
};

const readMap = file => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        return fail(`소스맵을 읽지 못했다 (${file}): ${error.message}`);
    }
};

// A frame this run rewrote into first-party source, e.g.
// `getMyProfile (apps/web/src/app/x.ts:42:7)`. `node_modules/` frames resolve
// too but are deliberately out of scope — nobody clicks through to those, and a
// version skew there says nothing about the checkout.
const RESOLVED_FRAME = /\(((?:apps|libs)\/[^\s():]+):\d+:\d+\)/g;

/**
 * Resolved paths this checkout does not have. Worth saying out loud: such a
 * frame is a stale checkout, not a bad resolve, and clicking it in the IDE
 * would just fail to open anything.
 */
const missingLocally = text => {
    const missing = new Set();

    for (const [, file] of text.matchAll(RESOLVED_FRAME)) {
        if (!fs.existsSync(path.join(REPO_ROOT, file))) missing.add(file);
    }

    return [...missing];
};

/** Prints the trace on stdout and everything about its provenance on stderr. */
const report = (resolved, original, sources, unresolved) => {
    for (const source of sources) process.stderr.write(`맵: ${source}\n`);
    for (const bundle of unresolved) {
        process.stderr.write(`${bundle}: 맵을 찾지 못해 원문 그대로 둔다.\n`);
    }

    // Only meaningful once a map was actually applied — with none found the
    // trace is obviously untouched, and saying "wrong build" would misdirect.
    if (sources.length && resolved === original) {
        process.stderr.write('어떤 프레임도 풀리지 않았다 — 다른 빌드의 맵일 수 있다.\n');
    }

    const missing = missingLocally(resolved);
    if (missing.length) {
        process.stderr.write(
            `\n체크아웃에 없는 파일 ${missing.length}건 (${missing[0]} 등) — 리포트가 나온 빌드의 커밋으로 옮겨야 줄 번호가 맞는다.\n`
        );
    }

    process.stderr.write('\n');
    process.stdout.write(resolved.endsWith('\n') ? resolved : `${resolved}\n`);

    // Nothing was resolved at all: the trace still prints, but this ran a
    // lookup and came back empty-handed, and a zero exit would claim otherwise.
    if (!sources.length) process.exitCode = 1;
};

const main = () => {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) return process.stdout.write(`${USAGE}\n`);

    const { meta, stack } = parseReport(readInput());
    if (!stack) fail(`스택이 비어 있다.\n\n${USAGE}`);

    const bundles = readBundleNames(stack);
    if (!bundles.length) fail('번들 프레임이 없는 스택이다 — 되짚을 것이 없다.');

    // A supplied map is still only good for its own bundle. Pin it to the one it
    // is named after when that bundle is in the trace; otherwise it has to apply
    // to everything, and a multi-bundle trace is then worth a warning — the
    // other bundle's frames will resolve, to the wrong lines.
    if (options.map) {
        const named = path.basename(options.map).replace(/\.map$/, '');
        const pinned = bundles.includes(named) ? named : undefined;
        if (!pinned && bundles.length > 1) {
            process.stderr.write(
                `주의: 스택이 번들 ${bundles.length}개(${bundles.join(', ')})를 걸치는데 맵은 하나다.\n`
            );
        }

        return report(resolveStack(readMap(options.map), stack, pinned), stack, [`${options.map} (직접 지정)`], []);
    }

    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const project = options.project || PROJECT_BY_APP[meta.app] || 'web';
    const notAfter = meta.at ? Date.parse(meta.at) : undefined;

    let resolved = stack;
    const sources = [];
    const unresolved = [];

    for (const bundle of bundles) {
        const found = findMap(bundle, project, notAfter);
        if (!found) {
            unresolved.push(bundle);
            continue;
        }

        sources.push(`${bundle} → ${found.from}`);
        resolved = resolveStack(readMap(found.path), resolved, bundle);
    }

    report(resolved, stack, sources, unresolved);
};

if (require.main === module) main();

module.exports = { parseReport, missingLocally };
