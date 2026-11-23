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
    it('puts each PR on its own orphan branch, files at the root, and leaves other branches alone', () => {
        const { dir, bare, work } = setup();
        sh(work, 'push', '--quiet', 'origin', 'develop:refs/heads/pr-assets/some-design');
        const first = run(work, '--pr', '7', path.join(dir, 'home screen.png'));
        expect(first.code).toBe(0);
        expect(first.out).toContain('#pr-assets/pr-7/home-screen.png');
        expect(sh(bare, 'rev-list', '--max-parents=0', 'pr-assets/pr-7')).toBe(sh(bare, 'rev-parse', 'pr-assets/pr-7'));
        expect(() => sh(bare, 'merge-base', 'pr-assets/pr-7', 'develop')).toThrow();

        expect(run(work, '--pr', '7', path.join(dir, 'room.png')).code).toBe(0);
        expect(run(work, '--pr', '8', path.join(dir, 'room.png')).code).toBe(0);
        expect(sh(bare, 'ls-tree', '--name-only', 'pr-assets/pr-7').split('\n')).toEqual([
            'home-screen.png',
            'room.png',
        ]);
        expect(sh(bare, 'ls-tree', '--name-only', 'pr-assets/pr-8')).toBe('room.png');

        expect(run(work, '--pr', '7', '--remove').out).toContain('deleted pr-assets/pr-7');
        expect(
            sh(bare, 'branch', '--list', 'pr-assets/*')
                .split('\n')
                .map(b => b.trim())
        ).toEqual(['pr-assets/pr-8', 'pr-assets/some-design']);
        expect(sh(work, 'status', '--porcelain')).toBe('');
        expect(sh(work, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('develop');
    });

    it('builds raw GitHub URLs for a GitHub remote', () => {
        const out = execFileSync(
            'node',
            [
                '--input-type=module',
                '-e',
                `import { branchFor } from ${JSON.stringify(SCRIPT)}; console.log(branchFor(1140));`,
            ],
            { encoding: 'utf8' }
        ).trim();
        expect(out).toBe('pr-assets/pr-1140');
    });

    it('accepts images only and needs a PR number', () => {
        const { dir, work } = setup();
        fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
        expect(run(work, '--pr', '7', path.join(dir, 'notes.txt')).out).toContain('only png');
        expect(run(work, path.join(dir, 'room.png')).out).toContain('--pr <number> is required');
    });
});
