const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseNumstat, parseNameStatus } = require('../git-input');
const { runClassify } = require('../cli');
const { hunksOldSide } = require('../backtest');

test('numstat parsing handles binary rows', () => {
    assert.deepEqual(parseNumstat('3\t1\ta.ts\0-\t-\tlogo.png\0'), [
        { path: 'a.ts', additions: 3, deletions: 1, binary: false },
        { path: 'logo.png', additions: 0, deletions: 0, binary: true },
    ]);
    assert.deepEqual(
        [...parseNameStatus('M\0a.ts\0A\0b.ts\0D\0c.ts\0')],
        [
            ['a.ts', 'M'],
            ['b.ts', 'A'],
            ['c.ts', 'D'],
        ]
    );
});

test('old-side hunk ranges skip pure insertions', () => {
    assert.deepEqual(hunksOldSide('@@ -3,2 +3,4 @@\n@@ -10 +12 @@\n@@ -20,0 +23,2 @@\n'), [
        [3, 4],
        [10, 10],
    ]);
});

test('runClassify reads a real git range end to end', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-merge-'));
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    git('init', '-q', '-b', 'develop');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    fs.mkdirSync(path.join(dir, 'libs/x/src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'libs/x/src/a.ts'), '// explains\nexport const a = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'chore: init');
    const base = git('rev-parse', 'HEAD');
    git('checkout', '-q', '-b', 'cleanup');
    fs.writeFileSync(path.join(dir, 'libs/x/src/a.ts'), 'export const a = 1;\n');
    git('commit', '-qam', 'refactor(x): drop a comment');
    const head = git('rev-parse', 'HEAD');
    const viewFile = path.join(dir, 'view.json');
    fs.writeFileSync(
        viewFile,
        JSON.stringify({ labels: [{ name: 'foo' }], isDraft: false, isCrossRepository: false, baseRefName: 'develop' })
    );

    const result = runClassify({ base, head, pr: viewFile, visual: 'success' }, dir);
    assert.equal(result.eligible, true);
    assert.deepEqual(result.classes, ['A1']);
    assert.equal(result.head, head);

    fs.writeFileSync(path.join(dir, 'libs/x/src/a.ts'), 'export const a = 2;\n');
    git('commit', '-qam', 'feat(x): change a');
    const changed = runClassify({ base, head: git('rev-parse', 'HEAD'), visual: 'failure' }, dir);
    assert.equal(changed.eligible, false);
    assert.match(changed.blocks.join(), /visual regression/);
    fs.rmSync(dir, { recursive: true, force: true });
});
