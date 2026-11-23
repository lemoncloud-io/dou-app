const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '../../docs/config/skills/dou-ship/references/pr-assets.mjs');
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
);

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const run = (cwd, ...args) => {
    try {
        return { code: 0, out: execFileSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' }) };
    } catch (error) {
        return { code: error.status, out: `${error.stdout}${error.stderr}` };
    }
};

const setup = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-assets-test-'));
    const bare = path.join(dir, 'remote.git');
    const work = path.join(dir, 'work');
    sh(dir, 'init', '--quiet', '--bare', bare);
    sh(dir, 'init', '--quiet', '-b', 'develop', work);
    sh(work, 'config', 'user.email', 'test@example.com');
    sh(work, 'config', 'user.name', 'test');
    fs.writeFileSync(path.join(work, 'README.md'), 'app\n');
    sh(work, 'add', 'README.md');
    sh(work, 'commit', '--quiet', '-m', 'init');
    sh(work, 'remote', 'add', 'origin', bare);
    sh(work, 'push', '--quiet', 'origin', 'develop');
    fs.writeFileSync(path.join(dir, 'home screen.png'), PNG);
    fs.writeFileSync(path.join(dir, 'room.png'), PNG);
    return { dir, bare, work };
};

describe('pr-assets', () => {
    it('refuses to create the branch without --create', () => {
        const { dir, bare, work } = setup();
        const result = run(work, '--pr', '7', path.join(dir, 'room.png'));
        expect(result.code).toBe(1);
        expect(result.out).toContain("owner's call");
        expect(sh(bare, 'branch', '--list', 'pr-assets')).toBe('');
    });

    it('creates an orphan branch, adds images per PR, and removes a PR folder', () => {
        const { dir, bare, work } = setup();
        const first = run(work, '--pr', '7', path.join(dir, 'home screen.png'), '--create');
        expect(first.code).toBe(0);
        expect(first.out).toContain('pr-7/home-screen.png');
        expect(sh(bare, 'rev-list', '--max-parents=0', 'pr-assets')).toBe(sh(bare, 'rev-parse', 'pr-assets'));
        expect(() => sh(bare, 'merge-base', 'pr-assets', 'develop')).toThrow();

        expect(run(work, '--pr', '8', path.join(dir, 'room.png')).code).toBe(0);
        expect(sh(bare, 'ls-tree', '-r', '--name-only', 'pr-assets').split('\n')).toEqual([
            'pr-7/home-screen.png',
            'pr-8/room.png',
        ]);

        expect(run(work, '--pr', '7', '--remove').code).toBe(0);
        expect(sh(bare, 'ls-tree', '-r', '--name-only', 'pr-assets')).toBe('pr-8/room.png');
        expect(sh(work, 'status', '--porcelain')).toBe('');
        expect(sh(work, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('develop');
    });

    it('accepts images only', () => {
        const { dir, work } = setup();
        fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
        const result = run(work, '--pr', '7', path.join(dir, 'notes.txt'), '--create');
        expect(result.code).toBe(1);
        expect(result.out).toContain('only png');
    });
});
