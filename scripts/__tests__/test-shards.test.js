const fs = require('fs');
const path = require('path');

const { execFileSync } = require('child_process');

const { parseArgs, planShards, recordSeconds, showArgs } = require('../test-shards');

describe('test shards', () => {
    it('deals projects out longest first to the lightest shard', () => {
        const plan = planShards(['a', 'b', 'c', 'd', 'e'], 2, { a: 10, b: 7, c: 5, d: 3, e: 2 });
        expect(plan.map(shard => shard.projects)).toEqual([
            ['a', 'd'],
            ['b', 'c', 'e'],
        ]);
        expect(plan.map(shard => shard.seconds)).toEqual([13, 14]);
    });

    it('counts a project with no recorded time as the median of the known ones', () => {
        const plan = planShards(['new', 'a', 'b', 'c'], 3, { a: 9, b: 4, c: 1 });
        expect(plan.find(shard => shard.projects.includes('new'))).toEqual({ projects: ['new'], seconds: 4 });
    });

    it('gives every project to exactly one shard and leaves extra shards empty', () => {
        const plan = planShards(['a', 'b'], 4, {});
        expect(plan.flatMap(shard => shard.projects).sort()).toEqual(['a', 'b']);
        expect(plan.filter(shard => shard.projects.length === 0)).toHaveLength(2);
    });

    it('turns the nx scope into show-projects arguments', () => {
        expect(showArgs('run-many')).toEqual([]);
        expect(showArgs('affected --base=abc --head=HEAD')).toEqual(['--affected', '--base=abc', '--head=HEAD']);
    });

    it('reads and checks its options', () => {
        expect(parseArgs(['--scope', 'run-many', '--index', '2', '--total', '4'])).toEqual({
            scope: 'run-many',
            index: 2,
            total: 4,
        });
        expect(() => parseArgs(['--scope', 'run-many', '--index', '5', '--total', '4'])).toThrow('Usage');
    });

    it('splits the four verify test jobs by the recorded seconds', () => {
        const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/verify.yml'), 'utf8');
        expect(workflow).toContain('shard: [1, 2, 3, 4]');
        expect(workflow).toContain('scripts/test-shards.js --scope "$NX_SCOPE" --index "$SHARD" --total 4');
        const seconds = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../test-seconds.json'), 'utf8'));
        Object.values(seconds).forEach(value => expect(Number.isInteger(value) && value > 0).toBe(true));
    });

    it('records each project from the time line that follows its nx group', () => {
        const log = [
            'job\tTest\t2026-11-26T14:40:00.0Z ##[group]✅ > nx run web:test',
            'job\tTest\t2026-11-26T14:41:00.0Z ^[[1mTime:^[[22m        213.2 s',
            'job\tTest\t2026-11-26T14:41:01.0Z ##[group]✅ > nx run admin:test',
            'job\tTest\t2026-11-26T14:41:02.0Z    Duration  103.87s (transform 29.38s)',
            'job\tTest\t2026-11-26T14:41:03.0Z ##[group]✅ > nx run desktop-web:test',
        ].join('\n');
        expect(recordSeconds(log)).toEqual({ admin: 104, web: 213 });
    });

    const aggregate = () => {
        const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/verify.yml'), 'utf8');
        const job = workflow.slice(workflow.indexOf('    verify:\n'));
        const run = job.slice(job.indexOf('run: |') + 'run: |'.length).split('\n');
        const body = [];
        for (const line of run.slice(1)) {
            if (line.trim() && !line.startsWith('                  ')) break;
            body.push(line.slice(18));
        }
        return body.join('\n');
    };

    const runAggregate = needs => {
        const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'aggregate-'));
        try {
            execFileSync('bash', ['-eo', 'pipefail', '-c', aggregate()], {
                cwd: dir,
                env: { ...process.env, RESULTS: JSON.stringify(needs) },
                stdio: 'pipe',
            });
            return 0;
        } catch (error) {
            return error.status;
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    };

    it('passes the aggregate verify job only when every gate job succeeded', () => {
        const jobs = ['base', 'checks', 'lint', 'typecheck', 'test'];
        const all = result => Object.fromEntries(jobs.map(job => [job, { result, outputs: {} }]));
        expect(runAggregate(all('success'))).toBe(0);
        expect(runAggregate({ ...all('success'), test: { result: 'failure', outputs: {} } })).not.toBe(0);
        expect(runAggregate({ ...all('success'), lint: { result: 'skipped', outputs: {} } })).not.toBe(0);
    });
});
