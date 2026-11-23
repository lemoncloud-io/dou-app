#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MARKER = '<!-- web-e2e-verification -->';
export const MAX_IMAGES = 24;
export const FILE_PREFIX = 'web-e2e-';
const MAX_BYTES = 3 * 1024 * 1024;

const usage = `usage:
  pr-verification.mjs publish --pr <n> --evidence <dir> [--evidence <dir>...] [--run <id>] [--repo owner/name]
                              [--remote-url <git url>] [--dry-run]
  pr-verification.mjs cleanup --pr <n> [--remote-url <git url>]
publish pushes the run's key screenshots to the orphan branch pr-assets/pr-<n>, replacing its own
web-e2e-* files and keeping any other file there, and creates or updates one "Verification results"
comment on the pull request. cleanup deletes the branch. Screenshots must come from fake-data runs: the repository is public and git keeps them.`;

export const parseArgs = argv => {
    const options = { command: argv[0], evidence: [], dryRun: false };
    for (let i = 1; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => argv[(i += 1)];
        if (arg === '--pr') options.pr = next();
        else if (arg === '--evidence') options.evidence.push(next());
        else if (arg === '--run') options.run = next();
        else if (arg === '--repo') options.repo = next();
        else if (arg === '--remote-url') options.remoteUrl = next();
        else if (arg === '--dry-run') options.dryRun = true;
        else throw new Error(`unknown argument ${arg}\n${usage}`);
    }
    if (!['publish', 'cleanup'].includes(options.command)) throw new Error(usage);
    if (!/^\d+$/.test(String(options.pr ?? ''))) throw new Error(`--pr <number> is required\n${usage}`);
    if (options.command === 'publish' && options.evidence.length === 0) {
        throw new Error(`--evidence is required\n${usage}`);
    }
    return options;
};

export const branchFor = pr => `pr-assets/pr-${pr}`;

export const readEvidence = dirs =>
    dirs
        .filter(dir => existsSync(join(dir, 'summary.json')))
        .map(dir => ({ dir, summary: JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')) }));

const failed = scenario => !scenario.expected && scenario.status !== 'skipped';
const isTagged = (scenario, tag) => (scenario.tags ?? []).includes(tag);

export const selectImages = runs => {
    const picked = [];
    const add = (dir, scenario, image, role) => {
        if (picked.some(entry => entry.source === join(dir, image.file))) return;
        picked.push({
            source: join(dir, image.file),
            name: `${FILE_PREFIX}${basename(image.file)}`,
            caption: image.caption,
            role,
            scenario,
        });
    };
    for (const { dir, summary } of runs) {
        for (const scenario of summary.scenarios) {
            if (isTagged(scenario, '@visual') && failed(scenario)) {
                for (const image of scenario.visualImages ?? []) add(dir, scenario, image, 'visual');
            }
        }
    }
    for (const { dir, summary } of runs) {
        for (const scenario of summary.scenarios) {
            const last = (scenario.screenshots ?? []).at(-1);
            const shown = picked.some(entry => entry.role === 'chaos' && entry.scenario.title === scenario.title);
            if (last && isTagged(scenario, '@chaos') && !scenario.repeat && !shown) add(dir, scenario, last, 'chaos');
        }
    }
    for (const { dir, summary } of runs) {
        for (const scenario of summary.scenarios) {
            const last = (scenario.screenshots ?? []).at(-1);
            if (last && failed(scenario) && !isTagged(scenario, '@visual')) add(dir, scenario, last, 'failure');
        }
    }
    return picked.slice(0, MAX_IMAGES);
};

const icon = scenario =>
    !scenario
        ? '—'
        : scenario.status === 'flaky'
          ? '⚠️ flaky'
          : failed(scenario)
            ? '❌'
            : scenario.status === 'skipped'
              ? '⏭️'
              : '✅';

const cell = text => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');

const median = values => {
    const numbers = values.filter(value => value !== null && value !== undefined).sort((a, b) => a - b);
    return numbers.length ? numbers[Math.floor((numbers.length - 1) / 2)] : null;
};

export const buildBody = ({ runs, images, imageUrl, runUrl }) => {
    const scenarios = runs.flatMap(({ summary }) => summary.scenarios);
    const projects = [...new Set(scenarios.map(scenario => scenario.project))].sort();
    const commits = [...new Set(runs.map(({ summary }) => summary.commit).filter(Boolean))];
    const anyFailed = scenarios.some(failed);
    const lines = [MARKER, '## Verification results', ''];
    lines.push(
        `${anyFailed ? '❌ Failed' : '✅ Passed'} · web-e2e${commits.length ? ` · ${commits.map(c => `\`${c}\``).join(', ')}` : ''}${runUrl ? ` · [run](${runUrl})` : ''}`,
        ''
    );
    lines.push('| Platform | Passed | Failed | Flaky | Skipped |', '| --- | --- | --- | --- | --- |');
    for (const project of projects) {
        const own = scenarios.filter(scenario => scenario.project === project);
        const count = test => own.filter(test).length;
        lines.push(
            `| ${project} | ${count(s => s.status === 'passed' && s.expected)} | ${count(s => failed(s) && s.status !== 'flaky')} | ${count(s => s.status === 'flaky')} | ${count(s => s.status === 'skipped')} |`
        );
    }
    lines.push('');

    const failures = scenarios.filter(scenario => failed(scenario) && scenario.status !== 'flaky');
    if (failures.length) {
        lines.push('### Failed', '');
        for (const scenario of failures) {
            const reason = (scenario.error ?? '').split('\n').find(line => line.trim()) ?? scenario.status;
            lines.push(
                `- **${cell(scenario.title)}** (${scenario.project}, \`${scenario.spec}\`): ${cell(reason).slice(0, 200)}`
            );
        }
        lines.push('');
    }

    const visual = scenarios.filter(scenario => isTagged(scenario, '@visual'));
    if (visual.length) {
        const differ = visual.filter(failed);
        lines.push(`### Visual regression ${differ.length ? '❌' : '✅'}`, '');
        lines.push(`${visual.length} scenarios compared with the baselines; ${differ.length} failed.`, '');
        const shots = images.filter(image => image.role === 'visual');
        if (shots.length) {
            const rows = new Map();
            for (const image of shots) {
                const [, base = image.caption, kind = 'actual'] =
                    /^(.*)-(expected|actual|diff)\.png$/.exec(image.caption) ?? [];
                const key = `${image.scenario.title}\u0000${image.scenario.project}\u0000${base}`;
                const row = rows.get(key) ?? { image, base, cells: {} };
                row.cells[kind] = `<img src="${imageUrl(image.name)}" width="160">`;
                rows.set(key, row);
            }
            lines.push('| Screen | Baseline | Actual | Diff |', '| --- | --- | --- | --- |');
            for (const { image, base, cells } of rows.values()) {
                lines.push(
                    `| ${cell(base)} · ${image.scenario.project} | ${cells.expected ?? ''} | ${cells.actual ?? ''} | ${cells.diff ?? ''} |`
                );
            }
            lines.push('');
        }
    }

    const titles = (filter, by = scenario => scenario.title) => [...new Set(scenarios.filter(filter).map(by))];
    const byTitle = (title, project) =>
        scenarios.find(scenario => scenario.title === title && scenario.project === project && !scenario.repeat);
    const chaos = titles(scenario => isTagged(scenario, '@chaos'));
    if (chaos.length) {
        lines.push('### Chaos', '');
        lines.push(
            `| Scenario | ${projects.join(' | ')} | End state |`,
            `| --- | ${projects.map(() => '---').join(' | ')} | --- |`
        );
        for (const title of chaos) {
            const shot = images.find(image => image.role === 'chaos' && image.scenario.title === title);
            const end = shot ? `<img src="${imageUrl(shot.name)}" width="140">` : '';
            lines.push(
                `| ${cell(title)} | ${projects.map(project => icon(byTitle(title, project))).join(' | ')} | ${end} |`
            );
        }
        lines.push('');
    }

    const measured = scenarios.filter(scenario => (scenario.metrics ?? []).length);
    if (measured.length) {
        lines.push(
            '### Load',
            '',
            `| Scenario | Measure | ${projects.join(' | ')} |`,
            `| --- | --- | ${projects.map(() => '---:').join(' | ')} |`
        );
        const rows = new Map();
        for (const scenario of measured) {
            for (const metric of scenario.metrics) {
                const key = `${scenario.title}\u0000${metric.name}`;
                const row = rows.get(key) ?? { scenario: scenario.title, metric, values: {} };
                (row.values[scenario.project] ??= []).push(metric.value);
                rows.set(key, row);
            }
        }
        for (const row of rows.values()) {
            const unit = row.metric.unit === 'count' ? '' : ` ${row.metric.unit}`;
            const values = projects.map(project => {
                const value = median(row.values[project] ?? []);
                return value === null ? 'n/a' : `${value}${unit}`;
            });
            lines.push(`| ${cell(row.scenario)} | ${cell(row.metric.name)} | ${values.join(' | ')} |`);
        }
        lines.push('', 'Medians over the repeats in this run; times are not budgets.', '');
    }

    const failureShots = images.filter(image => image.role === 'failure');
    if (failureShots.length) {
        lines.push('### Last screen of each failure', '', '| Scenario | Image |', '| --- | --- |');
        for (const image of failureShots) {
            lines.push(
                `| ${cell(image.scenario.title)} (${image.scenario.project}) | <img src="${imageUrl(image.name)}" width="180"> |`
            );
        }
        lines.push('');
    }

    const all = titles(
        () => true,
        scenario => `${scenario.spec}\u0000${scenario.title}`
    );
    lines.push(`<details><summary>All scenarios (${all.length})</summary>`, '');
    lines.push(
        `| Spec | Scenario | ${projects.join(' | ')} |`,
        `| --- | --- | ${projects.map(() => '---').join(' | ')} |`
    );
    for (const key of all) {
        const [spec, title] = key.split('\u0000');
        lines.push(
            `| \`${spec}\` | ${cell(title)} | ${projects.map(project => icon(byTitle(title, project))).join(' | ')} |`
        );
    }
    lines.push('', '</details>', '');
    return lines.join('\n');
};

const git = (args, cwd) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const remoteUrlOf = options => options.remoteUrl ?? git(['remote', 'get-url', 'origin']);

export const pushImages = ({ pr, images, remoteUrl, runId }) => {
    const work = mkdtempSync(join(tmpdir(), 'pr-assets-'));
    try {
        git(['init', '-q', '-b', 'assets'], work);
        if (git(['ls-remote', remoteUrl, `refs/heads/${branchFor(pr)}`], work)) {
            git(['fetch', '-q', '--depth=1', remoteUrl, `refs/heads/${branchFor(pr)}`], work);
            git(['checkout', '-q', 'FETCH_HEAD', '--', '.'], work);
        }
        for (const file of readdirSync(work)) {
            if (file.startsWith(FILE_PREFIX)) rmSync(join(work, file));
        }
        for (const image of images) {
            if (readFileSync(image.source).length > MAX_BYTES) continue;
            copyFileSync(image.source, join(work, image.name));
        }
        git(['add', '-A'], work);
        const identity = ['-c', 'user.name=web-e2e', '-c', 'user.email=web-e2e@users.noreply.github.com'];
        git(
            [
                ...identity,
                'commit',
                '-q',
                '--allow-empty',
                '-m',
                `web-e2e screenshots for #${pr}${runId ? ` (run ${runId})` : ''}`,
            ],
            work
        );
        git(['push', '-q', '--force', remoteUrl, `HEAD:refs/heads/${branchFor(pr)}`], work);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
};

export const deleteImages = ({ pr, remoteUrl }) => {
    const refs = git(['ls-remote', remoteUrl, `refs/heads/${branchFor(pr)}`]);
    if (!refs) return false;
    git(['push', '-q', remoteUrl, '--delete', `refs/heads/${branchFor(pr)}`]);
    return true;
};

const github = async (path, { method = 'GET', body } = {}) => {
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN (or GH_TOKEN) is required to write the comment');
    const response = await fetch(`https://api.github.com/${path}`, {
        method,
        headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/vnd.github+json',
            'content-type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    return response.json();
};

export const upsertComment = async ({ repo, pr, body, api = github }) => {
    for (let page = 1; page < 50; page += 1) {
        const comments = await api(`repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}`);
        const mine = comments.find(comment => String(comment.body ?? '').startsWith(MARKER));
        if (mine) return api(`repos/${repo}/issues/comments/${mine.id}`, { method: 'PATCH', body: { body } });
        if (comments.length < 100) break;
    }
    return api(`repos/${repo}/issues/${pr}/comments`, { method: 'POST', body: { body } });
};

const repoOf = options => {
    if (options.repo) return options.repo;
    if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
    const match = remoteUrlOf(options).match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    if (!match) throw new Error('--repo owner/name is required');
    return match[1];
};

export const main = async argv => {
    const options = parseArgs(argv);
    if (options.command === 'cleanup') {
        const removed = deleteImages({ pr: options.pr, remoteUrl: remoteUrlOf(options) });
        console.log(removed ? `deleted ${branchFor(options.pr)}` : `${branchFor(options.pr)} does not exist`);
        return;
    }
    const runs = readEvidence(options.evidence);
    if (runs.length === 0) throw new Error(`no summary.json under ${options.evidence.join(', ')}`);
    const images = selectImages(runs);
    const repo = repoOf(options);
    const imageUrl = name =>
        `https://raw.githubusercontent.com/${repo}/${branchFor(options.pr)}/${name}${options.run ? `?run=${options.run}` : ''}`;
    const runUrl = options.run ? `https://github.com/${repo}/actions/runs/${options.run}` : undefined;
    const body = buildBody({ runs, images, imageUrl, runUrl });
    if (options.dryRun) {
        console.log(images.map(image => `${image.role}\t${image.source}`).join('\n'));
        console.log(body);
        return;
    }
    if (images.length) pushImages({ pr: options.pr, images, remoteUrl: remoteUrlOf(options), runId: options.run });
    const comment = await upsertComment({ repo, pr: options.pr, body });
    console.log(`comment ${comment.html_url ?? comment.id}; ${images.length} images on ${branchFor(options.pr)}`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main(process.argv.slice(2)).catch(error => {
        console.error(error.message ?? error);
        process.exit(1);
    });
}
