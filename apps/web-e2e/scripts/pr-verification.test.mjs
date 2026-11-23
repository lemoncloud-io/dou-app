import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
    branchFor,
    buildBody,
    deleteImages,
    MARKER,
    parseArgs,
    pushImages,
    readEvidence,
    selectImages,
    upsertComment,
} from './pr-verification.mjs';

const scenario = fields => ({
    title: 'a scenario',
    spec: 'a.spec.ts',
    line: 1,
    project: 'chromium-android',
    tags: [],
    status: 'passed',
    expected: true,
    repeat: 0,
    metrics: [],
    screenshots: [],
    visualImages: [],
    ...fields,
});

const evidenceDir = scenarios => {
    const dir = mkdtempSync(join(tmpdir(), 'evidence-'));
    mkdirSync(join(dir, 'images'));
    for (const s of scenarios) {
        for (const image of [...s.screenshots, ...s.visualImages]) writeFileSync(join(dir, image.file), 'png');
    }
    writeFileSync(join(dir, 'summary.json'), JSON.stringify({ commit: 'abc1234', scenarios }));
    return dir;
};

const world = () => [
    scenario({
        title: 'offline send',
        tags: ['@chaos'],
        screenshots: [
            { caption: '01 offline', file: 'images/a-1.jpg' },
            { caption: '02 delivered', file: 'images/a-2.jpg' },
        ],
    }),
    scenario({ title: 'offline send', project: 'webkit-ios', tags: ['@chaos'], status: 'flaky' }),
    scenario({
        title: 'MY',
        tags: ['@visual'],
        status: 'failed',
        expected: false,
        error: 'Error: expect(page).toHaveScreenshot(expected) failed\n  more',
        visualImages: [
            { caption: 'my-expected.png', file: 'images/my-expected.png' },
            { caption: 'my-diff.png', file: 'images/my-diff.png' },
        ],
    }),
    scenario({
        title: '200 rooms',
        tags: ['@load'],
        metrics: [{ name: 'boot → first row', value: 3200, unit: 'ms' }],
    }),
    scenario({
        title: '200 rooms',
        project: 'webkit-ios',
        tags: ['@load'],
        metrics: [{ name: 'boot → first row', value: null, unit: 'ms' }],
    }),
];

test('parses publish and cleanup, and refuses a missing pr', () => {
    assert.deepEqual(parseArgs(['publish', '--pr', '12', '--evidence', 'a', '--evidence', 'b', '--run', '9']), {
        command: 'publish',
        pr: '12',
        evidence: ['a', 'b'],
        run: '9',
        dryRun: false,
    });
    assert.equal(parseArgs(['cleanup', '--pr', '3']).command, 'cleanup');
    assert.throws(() => parseArgs(['publish', '--evidence', 'a']), /--pr/);
    assert.throws(() => parseArgs(['publish', '--pr', '1']), /--evidence/);
    assert.equal(branchFor(7), 'pr-assets/pr-7');
});

test('picks visual diffs first, then each chaos end state, never a whole series', () => {
    const runs = readEvidence([evidenceDir(world())]);
    const picked = selectImages(runs).map(image => `${image.role}:${image.name}`);
    assert.deepEqual(picked, ['visual:web-e2e-my-expected.png', 'visual:web-e2e-my-diff.png', 'chaos:web-e2e-a-2.jpg']);
});

test('writes one marked comment with the verdict, failures, chaos, visual and load', () => {
    const runs = readEvidence([evidenceDir(world())]);
    const images = selectImages(runs);
    const body = buildBody({ runs, images, imageUrl: name => `https://img/${name}?run=9`, runUrl: 'https://run/9' });
    assert.ok(body.startsWith(MARKER));
    assert.match(body, /❌ Failed · web-e2e · `abc1234` · \[run\]\(https:\/\/run\/9\)/);
    assert.match(
        body,
        /\*\*MY\*\* \(chromium-android, `a\.spec\.ts`\): Error: expect\(page\)\.toHaveScreenshot\(expected\) failed/
    );
    assert.match(
        body,
        /\| offline send \| ✅ \| ⚠️ flaky \| <img src="https:\/\/img\/web-e2e-a-2\.jpg\?run=9" width="140"> \|/
    );
    assert.match(body, /\| 200 rooms \| boot → first row \| 3200 ms \| n\/a \|/);
    assert.match(
        body,
        /\| my · chromium-android \| <img src="https:\/\/img\/web-e2e-my-expected\.png\?run=9" width="160"> \| {2}\| <img src="https:\/\/img\/web-e2e-my-diff\.png\?run=9" width="160"> \|/
    );
});

test('updates the marked comment when there is one, and creates it otherwise', async () => {
    const calls = [];
    const api = async (path, init = {}) => {
        calls.push(`${init.method ?? 'GET'} ${path}`);
        if (path.includes('/issues/5/comments?')) {
            return [
                { id: 1, body: 'hi' },
                { id: 2, body: `${MARKER}\nold` },
            ];
        }
        if (path.includes('/issues/6/comments?')) return [{ id: 3, body: 'hi' }];
        return { id: 99 };
    };
    await upsertComment({ repo: 'o/r', pr: '5', body: 'new', api });
    await upsertComment({ repo: 'o/r', pr: '6', body: 'new', api });
    assert.deepEqual(calls, [
        'GET repos/o/r/issues/5/comments?per_page=100&page=1',
        'PATCH repos/o/r/issues/comments/2',
        'GET repos/o/r/issues/6/comments?per_page=100&page=1',
        'POST repos/o/r/issues/6/comments',
    ]);
});

test('replaces its own images on the pr branch, keeps the others there, and deletes the branch on cleanup', () => {
    const bare = mkdtempSync(join(tmpdir(), 'bare-'));
    execFileSync('git', ['init', '-q', '--bare', bare]);
    const remoteUrl = `file://${bare}`;
    const seed = mkdtempSync(join(tmpdir(), 'seed-'));
    const inSeed = args => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: seed });
    inSeed(['init', '-q', '-b', 'x']);
    writeFileSync(join(seed, 'pr-body-shot.jpg'), 'jpg');
    inSeed(['add', '-A']);
    inSeed(['commit', '-q', '-m', 'pr body image']);
    inSeed(['push', '-q', remoteUrl, `HEAD:refs/heads/${branchFor(5)}`]);
    const runs = readEvidence([evidenceDir(world())]);
    const files = () =>
        execFileSync('git', ['--git-dir', bare, 'ls-tree', '--name-only', branchFor(5)], { encoding: 'utf8' })
            .trim()
            .split('\n');

    pushImages({ pr: '5', images: selectImages(runs), remoteUrl, runId: '1' });
    assert.deepEqual(files(), [
        'pr-body-shot.jpg',
        'web-e2e-a-2.jpg',
        'web-e2e-my-diff.png',
        'web-e2e-my-expected.png',
    ]);
    pushImages({ pr: '5', images: selectImages(runs).slice(0, 1), remoteUrl, runId: '2' });
    assert.deepEqual(files(), ['pr-body-shot.jpg', 'web-e2e-my-expected.png']);
    const commits = execFileSync('git', ['--git-dir', bare, 'rev-list', '--count', branchFor(5)], { encoding: 'utf8' });
    assert.equal(commits.trim(), '1');

    assert.equal(deleteImages({ pr: '5', remoteUrl }), true);
    assert.equal(deleteImages({ pr: '5', remoteUrl }), false);
});
