const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { check, format, parseArgs } = require('../cli');
const { parseNumstat } = require('../git-input');

function repo() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-only-'));
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    const write = (rel, text) => {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), text);
    };
    git('init', '-q', '-b', 'develop');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    write('libs/x/src/a.ts', '// explains\nexport const a = 1;\n');
    write('libs/x/README.md', '# x\n');
    git('add', '.');
    git('commit', '-q', '-m', 'chore: init');
    git('checkout', '-q', '-b', 'cleanup');
    return { dir, git, write, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('a cleanup that only removes comments passes, docs beside it are skipped', () => {
    const r = repo();
    r.write('libs/x/src/a.ts', 'export const a = 1;\n');
    r.write('libs/x/README.md', '# x\n\nWhy a is 1.\n');
    r.git('commit', '-qam', 'refactor(x): move the comment into the readme');
    const report = check({ base: 'develop', head: 'HEAD', cwd: r.dir });
    assert.equal(report.ok, true);
    assert.deepEqual(
        report.files.map(f => [f.path, f.result]),
        [
            ['libs/x/README.md', 'skipped'],
            ['libs/x/src/a.ts', 'proven'],
        ]
    );
    assert.match(format(report), /Comment-only: 1 source files changed/);
    r.done();
});

test('a code change, an added source file, or no source change fails', () => {
    const r = repo();
    r.write('libs/x/src/a.ts', 'export const a = 2;\n');
    r.git('commit', '-qam', 'feat(x): change a');
    assert.equal(check({ base: 'develop', head: 'HEAD', cwd: r.dir }).ok, false);
    r.git('reset', '-q', '--hard', 'develop');
    r.write('libs/x/src/b.ts', 'export {};\n');
    r.git('add', '.');
    r.git('commit', '-qm', 'feat(x): add b');
    assert.match(check({ base: 'develop', head: 'HEAD', cwd: r.dir }).files[0].why, /added, deleted/);
    r.git('reset', '-q', '--hard', 'develop');
    r.write('libs/x/README.md', '# y\n');
    r.git('commit', '-qam', 'docs(x): rename');
    const docsOnly = check({ base: 'develop', head: 'HEAD', cwd: r.dir });
    assert.equal(docsOnly.ok, false);
    assert.match(format(docsOnly), /Not comment-only/);
    r.done();
});

test('arguments and numstat parsing', () => {
    assert.deepEqual(parseArgs(['--base', 'main', '--json']), { base: 'main', head: 'HEAD', json: true });
    assert.throws(() => parseArgs(['--nope']), /unexpected argument/);
    assert.deepEqual(parseNumstat('3\t1\ta\tb.ts\0-\t-\tlogo.png\0'), [
        { path: 'a\tb.ts', additions: 3, deletions: 1, binary: false },
        { path: 'logo.png', additions: 0, deletions: 0, binary: true },
    ]);
});
