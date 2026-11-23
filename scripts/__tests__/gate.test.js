const { parseArgs, decideScope, typecheckExclusions, buildSteps } = require('../gate');

describe('gate scope', () => {
    it('checks every project when there is no base to compare with', () => {
        expect(decideScope({ base: '', changed: ['apps/web/src/a.ts'] })).toEqual(['run-many']);
    });

    it('checks the affected projects when only apps, libs and markdown changed', () => {
        expect(
            decideScope({ base: 'abc', changed: ['apps/web/src/a.ts', 'libs/data/x.ts', 'docs/adr/0001.md'] })
        ).toEqual(['affected', '--base=abc']);
        expect(decideScope({ base: 'abc', changed: [], head: 'HEAD' })).toEqual([
            'affected',
            '--base=abc',
            '--head=HEAD',
        ]);
    });

    it('checks every project when a file outside apps and libs changed', () => {
        expect(decideScope({ base: 'abc', changed: ['apps/web/a.ts', 'eslint.config.mjs'] })).toEqual(['run-many']);
        expect(decideScope({ base: 'abc', changed: ['scripts/gate.js'] })).toEqual(['run-many']);
        expect(decideScope({ base: 'abc', changed: ['tools/eslint-rules/ratchet-baseline.json'] })).toEqual([
            'run-many',
        ]);
    });
});

describe('gate typecheck exclusions', () => {
    it('reads the list verify.yml passes to typecheck', () => {
        expect(typecheckExclusions('run: >\n  npx nx $NX_SCOPE -t typecheck\n  --exclude=a,@b/c\n')).toBe('a,@b/c');
        expect(typecheckExclusions()).toMatch(/^[\w@/,-]+$/);
    });

    it('fails loudly when the workflow no longer has the list', () => {
        expect(() => typecheckExclusions('run: npx nx affected -t typecheck')).toThrow('no `-t typecheck --exclude=`');
    });
});

describe('gate steps', () => {
    it('runs the baseline direction check only when there is a base', () => {
        const names = base => buildSteps({ scope: ['run-many'], base, only: ['ratchets'] }).map(step => step.name);
        expect(names('abc')).toContain('baselines only go down');
        expect(names(null)).not.toContain('baselines only go down');
    });

    it('holds every ratchet to the base baseline when there is a base', () => {
        const steps = buildSteps({ scope: ['run-many'], base: 'abc', only: ['ratchets'] });
        const checks = steps.filter(step => step.cmd.includes('check'));
        expect(checks.map(step => step.cmd[4])).toEqual(['source', 'knip', 'jscpd', 'testTypecheck']);
        checks.forEach(step => expect(step.cmd.slice(-2)).toEqual(['--reference', 'abc']));
        expect(
            buildSteps({ scope: ['run-many'], base: null, only: ['ratchets'] }).some(step =>
                step.cmd.includes('--reference')
            )
        ).toBe(false);
    });

    it('passes the scope to every nx step', () => {
        const steps = buildSteps({
            scope: ['affected', '--base=abc'],
            base: 'abc',
            only: ['lint', 'typecheck', 'test'],
        });
        expect(steps.map(step => step.cmd.slice(0, 6))).toEqual([
            ['npx', 'nx', 'affected', '--base=abc', '--skip-sync', '-t'],
            ['npx', 'nx', 'affected', '--base=abc', '--skip-sync', '-t'],
            ['npx', 'nx', 'affected', '--base=abc', '--skip-sync', '-t'],
        ]);
        expect(steps.map(step => step.cmd[6])).toEqual(['lint', 'typecheck', 'test']);
        expect(steps[1].cmd[7]).toMatch(/^--exclude=/);
    });

    it('reads its options', () => {
        expect(parseArgs(['--base', 'origin/main', '--only', 'lint,test'])).toMatchObject({
            command: 'run',
            base: 'origin/main',
            only: ['lint', 'test'],
        });
        expect(parseArgs(['scope', '--base', 'abc'])).toMatchObject({ command: 'scope', base: 'abc' });
        expect(() => parseArgs(['--only', 'deploy'])).toThrow('unknown step deploy');
        expect(() => parseArgs(['--base'])).toThrow('--base needs a value');
        expect(() => parseArgs(['--only', '--all'])).toThrow('--only needs a value');
    });
});
