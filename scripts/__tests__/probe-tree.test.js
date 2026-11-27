const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.resolve(__dirname, '../../docs/config/skills/dou-ship/references/probe-tree.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const write = (file, text) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
};
const run = (cwd, root, ...args) =>
    spawnSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, DOU_PROBE_ROOT: root } });
const probeTrees = repo =>
    git(repo, 'worktree', 'list', '--porcelain')
        .split('\n')
        .filter(line => line.startsWith('worktree ') && line.includes('dou-probe-'));

describe('probe-tree', () => {
    let base;
    let repo;
    let root;

    beforeEach(() => {
        base = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-tree-test-'));
        repo = path.join(base, 'repo');
        root = path.join(base, 'probes');
        fs.mkdirSync(repo);
        git(repo, 'init', '-q', '-b', 'main');
        git(repo, 'config', 'user.email', 't@example.invalid');
        git(repo, 'config', 'user.name', 't');
        write(path.join(repo, '.gitignore'), 'node_modules\n');
        write(path.join(repo, 'libs/a/src/kept.ts'), 'export const kept = 1;\n');
        write(path.join(repo, 'libs/a/src/gone.ts'), 'export const gone = 1;\n');
        write(path.join(repo, 'libs/a/src/edited.ts'), 'export const edited = 1;\n');
        git(repo, 'add', '-A');
        git(repo, 'commit', '-q', '-m', 'base');
    });

    afterEach(() => {
        fs.rmSync(base, { recursive: true, force: true });
    });

    it('copies committed, unstaged, deleted, untracked and symlinked state, from a subdirectory', () => {
        write(path.join(repo, 'node_modules/pkg/index.js'), 'module.exports = 1;\n');
        write(path.join(repo, 'libs/a/src/edited.ts'), 'export const edited = 2;\n');
        fs.rmSync(path.join(repo, 'libs/a/src/gone.ts'));
        write(path.join(repo, 'libs/b/src/new file.ts'), 'export const added = 1;\n');
        fs.symlinkSync('../../a/src/kept.ts', path.join(repo, 'libs/b/src/link.ts'));
        fs.mkdirSync(path.join(repo, 'apps/web'), { recursive: true });

        const made = run(path.join(repo, 'apps/web'), root);
        expect(made.status).toBe(0);
        const tree = made.stdout.trim();

        expect(fs.readFileSync(path.join(tree, 'libs/a/src/edited.ts'), 'utf8')).toContain('edited = 2');
        expect(fs.existsSync(path.join(tree, 'libs/a/src/gone.ts'))).toBe(false);
        expect(fs.readFileSync(path.join(tree, 'libs/b/src/new file.ts'), 'utf8')).toContain('added');
        expect(fs.readlinkSync(path.join(tree, 'libs/b/src/link.ts'))).toBe('../../a/src/kept.ts');
        expect(fs.realpathSync(path.join(tree, 'node_modules'))).toBe(fs.realpathSync(path.join(repo, 'node_modules')));
        expect(git(repo, 'status', '--porcelain')).toContain('libs/b/');

        expect(run(repo, root, '--remove', tree).status).toBe(0);
        expect(fs.existsSync(tree)).toBe(false);
        expect(fs.existsSync(path.join(repo, 'node_modules/pkg/index.js'))).toBe(true);
        expect(probeTrees(repo)).toEqual([]);
    });

    it('leaves no tree behind and prints nothing when it fails', () => {
        const made = run(repo, root);
        expect(made.status).toBe(1);
        expect(made.stdout).toBe('');
        expect(made.stderr).toContain('no node_modules');
        expect(probeTrees(repo)).toEqual([]);
        expect(fs.readdirSync(root)).toEqual([]);
    });

    it('refuses a large set of untracked files instead of copying it', () => {
        write(path.join(repo, 'node_modules/pkg/index.js'), '');
        for (let i = 0; i < 2001; i += 1) {
            write(path.join(repo, `stray/${i}.txt`), '');
        }
        const made = run(repo, root);
        expect(made.status).toBe(1);
        expect(made.stderr).toContain('refusing');
        expect(fs.existsSync(root)).toBe(false);
    });

    it('removes only probe trees', () => {
        expect(run(repo, root, '--remove', repo).status).toBe(1);
        expect(fs.existsSync(repo)).toBe(true);
    });
});
