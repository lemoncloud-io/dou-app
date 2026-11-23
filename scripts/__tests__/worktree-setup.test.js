const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const setup = require('../worktree-setup');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

describe('worktree setup — lockfile', () => {
    it('maps every pattern of an entry to its resolved URL', () => {
        const lock = setup.parseLockfile(
            [
                '# yarn lockfile v1',
                '',
                '"@a/b@^1.0.0", "@a/b@^1.1.0":',
                '  version "1.2.0"',
                '  resolved "https://registry.example/@a/b-1.2.0.tgz#abc"',
                '',
                'left-pad@1.3.0:',
                '  version "1.3.0"',
                '  resolved "https://registry.example/left-pad-1.3.0.tgz#def"',
                '  dependencies:',
                '    other "^1"',
            ].join('\n')
        );
        expect([...lock]).toEqual([
            ['@a/b@^1.0.0', 'https://registry.example/@a/b-1.2.0.tgz#abc'],
            ['@a/b@^1.1.0', 'https://registry.example/@a/b-1.2.0.tgz#abc'],
            ['left-pad@1.3.0', 'https://registry.example/left-pad-1.3.0.tgz#def'],
        ]);
    });

    it('reports node_modules installed from another lockfile', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-lock-'));
        fs.mkdirSync(path.join(root, 'node_modules'));
        fs.writeFileSync(path.join(root, 'yarn.lock'), 'x@^1:\n  resolved "u2"\n');
        expect(setup.nodeModulesDrift(root)).toMatchObject({
            inSync: false,
            reason: expect.stringContaining('no yarn integrity'),
        });
        const integrity = entries =>
            fs.writeFileSync(
                path.join(root, 'node_modules/.yarn-integrity'),
                JSON.stringify({ lockfileEntries: entries })
            );
        integrity({ 'x@^1': 'u1', 'gone@^2': 'u3' });
        expect(setup.nodeModulesDrift(root)).toMatchObject({ inSync: false, sample: ['x@^1', 'gone@^2'] });
        integrity({ 'x@^1': 'u2' });
        expect(setup.nodeModulesDrift(root)).toEqual({ inSync: true });
        fs.rmSync(root, { recursive: true, force: true });
    });
});

describe('worktree setup — local files', () => {
    it('links a linked file, copies a plain one and leaves an existing one alone', () => {
        const root = '/w';
        expect(
            setup.planLocalFile({
                root,
                relative: '.env.dev',
                source: { kind: 'link', target: '/s/.env.dev' },
                existing: null,
            })
        ).toMatchObject({ action: 'link', destination: '/w/.env.dev' });
        expect(
            setup.planLocalFile({
                root,
                relative: 'apps/web/.env.localhost',
                source: { kind: 'copy', source: '/m/x' },
                existing: null,
            })
        ).toMatchObject({ action: 'copy' });
        expect(
            setup.planLocalFile({
                root,
                relative: '.env.dev',
                source: { kind: 'link', target: '/s/.env.dev' },
                existing: { kind: 'link', target: '/s/.env.dev' },
            })
        ).toMatchObject({ action: 'linked already' });
        expect(
            setup.planLocalFile({
                root,
                relative: '.env.dev',
                source: { kind: 'link', target: '/s/.env.dev' },
                existing: { kind: 'file' },
            })
        ).toMatchObject({ action: 'kept (exists)' });
    });

    it('refuses a path that leaves the worktree', () => {
        expect(() =>
            setup.planLocalFile({
                root: '/w',
                relative: '../main/.env',
                source: { kind: 'copy', source: '/m' },
                existing: null,
            })
        ).toThrow('refusing to write outside the worktree');
        expect(setup.isInside('/w', '/w/a')).toBe(true);
        expect(setup.isInside('/w', '/w')).toBe(false);
        expect(setup.isInside('/w', '/other/a')).toBe(false);
    });

    describe('in a real repository with a linked worktree', () => {
        let base;
        let main;
        let worktree;
        let secrets;

        beforeAll(() => {
            base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-setup-')));
            main = path.join(base, 'main');
            worktree = path.join(base, 'wt');
            secrets = path.join(base, 'secrets');
            fs.mkdirSync(path.join(main, 'apps/web'), { recursive: true });
            fs.mkdirSync(path.join(main, 'apps/mobile/fastlane'), { recursive: true });
            fs.mkdirSync(secrets);
            fs.writeFileSync(path.join(main, '.gitignore'), '.env\n.env.*\n!.env.example\n');
            fs.writeFileSync(path.join(main, 'apps/web/.env.example'), 'KEY=\n');
            git(main, 'init', '-q', '-b', 'develop');
            git(main, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'add', '.');
            git(main, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-qm', 'init');
            fs.writeFileSync(path.join(secrets, 'web.env'), 'SECRET=1\n');
            fs.symlinkSync(path.join(secrets, 'web.env'), path.join(main, 'apps/web/.env'));
            fs.writeFileSync(path.join(main, '.env.localhost'), 'LOCAL=1\n');
            fs.writeFileSync(path.join(main, 'apps/mobile/fastlane/.env'), 'RELEASE=1\n');
            fs.mkdirSync(path.join(main, 'apps/desktop'), { recursive: true });
            fs.writeFileSync(path.join(main, 'apps/desktop/.env.signing'), 'CERT=1\n');
            git(main, 'worktree', 'add', '-q', worktree, '-b', 'feature');
        });

        afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

        it('finds the main checkout from the worktree', () => {
            expect(setup.findMainCheckout(worktree)).toBe(main);
        });

        it('links and copies the env files the way the main checkout has them, and nothing else', () => {
            const plans = setup.setupLocalFiles({ root: worktree, mainCheckout: main, dryRun: false });
            expect(plans.map(plan => [plan.relative, plan.action])).toEqual([
                ['.env.localhost', 'copy'],
                ['apps/web/.env', 'link'],
            ]);
            expect(fs.readlinkSync(path.join(worktree, 'apps/web/.env'))).toBe(path.join(secrets, 'web.env'));
            expect(fs.lstatSync(path.join(worktree, '.env.localhost')).isSymbolicLink()).toBe(false);
            expect(fs.existsSync(path.join(worktree, 'apps/mobile/fastlane/.env'))).toBe(false);
            expect(fs.existsSync(path.join(worktree, 'apps/desktop/.env.signing'))).toBe(false);
        });

        it('changes nothing on a second run', () => {
            fs.writeFileSync(path.join(worktree, '.env.localhost'), 'EDITED=1\n');
            const plans = setup.setupLocalFiles({ root: worktree, mainCheckout: main, dryRun: false });
            expect(plans.map(plan => plan.action)).toEqual(['kept (exists)', 'linked already']);
            expect(fs.readFileSync(path.join(worktree, '.env.localhost'), 'utf8')).toBe('EDITED=1\n');
        });

        it('lists dirty paths whole, even when the first entry is an unstaged change', () => {
            fs.appendFileSync(path.join(worktree, '.gitignore'), '# local\n');
            fs.writeFileSync(path.join(worktree, 'new file.txt'), 'x');
            expect(setup.dirtyFiles(worktree)).toEqual(['.gitignore', 'new file.txt']);
            git(worktree, 'checkout', '--', '.gitignore');
            fs.rmSync(path.join(worktree, 'new file.txt'));
        });

        it('refuses to run in the main checkout', () => {
            const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
            expect(setup.main({ root: main, dryRun: false })).toBe(2);
            expect(error).toHaveBeenCalledWith(expect.stringContaining('this is the main checkout'));
            error.mockRestore();
        });
    });
});
