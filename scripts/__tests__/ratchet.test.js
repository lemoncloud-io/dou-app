const baseline = require('../ratchet/baseline');
const knip = require('../ratchet/knip');
const jscpd = require('../ratchet/jscpd');
const { countFile } = require('../ratchet/source');
const { parseArgs, readModes } = require('../ratchet');

describe('ratchet baseline', () => {
    it('serializes one sorted entry per line and drops zero counts', () => {
        expect(baseline.serialize({ 'b.ts': { comments: 2, asAny: 0 }, 'a.ts': { comments: 0 }, 'c.ts': 3 })).toBe(
            '{\n    "b.ts": {"comments":2},\n    "c.ts": 3\n}\n'
        );
        expect(baseline.serialize({})).toBe('{}\n');
    });

    it('rejects a leaf that is not a non-negative integer', () => {
        expect(() => baseline.flatten({ 'a.ts': { comments: 1.5 } })).toThrow('not a non-negative integer');
        expect(() => baseline.flatten({ 'a.ts': 'x' })).toThrow('not a non-negative integer');
    });

    it('reports counts above the baseline, treating a missing entry as zero', () => {
        const { over, under } = baseline.compare(
            { 'a.ts': { comments: 3 }, 'new.ts': { asAny: 1 } },
            { 'a.ts': { comments: 2 } }
        );
        expect(over).toEqual([
            { path: ['a.ts', 'comments'], count: 3, allowed: 2 },
            { path: ['new.ts', 'asAny'], count: 1, allowed: 0 },
        ]);
        expect(under).toEqual([]);
    });

    it('reports a baseline left above the count, including a file that no longer exists', () => {
        const { under } = baseline.compare({ 'a.ts': { comments: 1 } }, { 'a.ts': { comments: 2 }, 'gone.ts': 4 });
        expect(under).toEqual([
            { path: ['a.ts', 'comments'], count: 1, allowed: 2 },
            { path: ['gone.ts'], count: 0, allowed: 4 },
        ]);
    });

    it('lowers to the current count and never raises or adds', () => {
        const next = baseline.lower(
            { 'a.ts': { comments: 5, asAny: 2 }, 'b.ts': { comments: 1 } },
            { 'a.ts': { comments: 3, asAny: 9 }, 'c.ts': { comments: 4 } }
        );
        expect(next).toEqual({ 'a.ts': { comments: 3, asAny: 2 } });
    });

    it('accepts a baseline that only went down', () => {
        expect(baseline.increases({ 'a.ts': { comments: 5 }, 'b.ts': 2 }, { 'a.ts': { comments: 4 } })).toEqual([]);
    });

    it('rejects a raised count and a new entry', () => {
        expect(
            baseline.increases({ 'a.ts': { comments: 5 } }, { 'a.ts': { comments: 6 }, 'n.ts': { asAny: 1 } })
        ).toEqual([
            { path: ['a.ts', 'comments'], count: 6, allowed: 5 },
            { path: ['n.ts', 'asAny'], count: 1, allowed: 0 },
        ]);
    });

    it('lets an entry follow a renamed file or folder without growing', () => {
        const renames = new Map([
            ['libs/old/x.ts', 'libs/new/x.ts'],
            ['apps/a', 'apps/b'],
        ]);
        const before = { 'libs/old/x.ts': { comments: 4 }, 'apps/a/y.ts': { useEffect: 2 } };
        expect(
            baseline.increases(before, { 'libs/new/x.ts': { comments: 4 }, 'apps/b/y.ts': { useEffect: 1 } }, renames)
        ).toEqual([]);
        expect(baseline.increases(before, { 'libs/new/x.ts': { comments: 5 } }, renames)).toEqual([
            { path: ['libs/new/x.ts', 'comments'], count: 5, allowed: 4 },
        ]);
    });
});

describe('ratchet reference baseline', () => {
    it('moves entries to renamed paths, keeping the larger count when two meet', () => {
        const renames = new Map([['apps/a', 'apps/b']]);
        expect(
            baseline.followRenames(
                { 'apps/a/x.ts': { comments: 3 }, 'apps/b/x.ts': { comments: 5 }, 'k.ts': 2 },
                renames
            )
        ).toEqual({
            'apps/b/x.ts': { comments: 5 },
            'k.ts': 2,
        });
    });

    it('allows no more than the lower of the reference and the branch baseline', () => {
        const allowed = baseline.lower(
            { 'a.ts': { comments: 5 }, 'b.ts': { comments: 2 } },
            { 'a.ts': { comments: 3 }, 'b.ts': { comments: 9 }, 'c.ts': { comments: 4 } }
        );
        expect(allowed).toEqual({ 'a.ts': { comments: 3 }, 'b.ts': { comments: 2 } });
    });
});

describe('ratchet knip report', () => {
    it('keys every unused file, export, type and duplicate by file', () => {
        const result = knip.fromReport({
            files: ['libs/a/unused.ts'],
            issues: [
                {
                    file: 'apps/web/src/app.tsx',
                    exports: [{ name: 'App' }],
                    types: [{ name: 'Props' }],
                    duplicates: [[{ name: 'default' }, { name: 'App' }]],
                },
            ],
        });
        expect(result).toEqual({
            'libs/a/unused.ts': { file: 1 },
            'apps/web/src/app.tsx': { 'export:App': 1, 'type:Props': 1, 'duplicate:App|default': 1 },
        });
    });
});

describe('ratchet jscpd report', () => {
    it('counts each file’s duplicated lines once even when clones overlap', () => {
        const result = jscpd.fromReport({
            duplicates: [
                { firstFile: { name: 'a.ts', start: 1, end: 10 }, secondFile: { name: 'b.ts', start: 5, end: 14 } },
                { firstFile: { name: 'a.ts', start: 8, end: 12 }, secondFile: { name: 'c.ts', start: 1, end: 5 } },
            ],
        });
        expect(result).toEqual({ 'a.ts': 12, 'b.ts': 10, 'c.ts': 5 });
    });
});

describe('ratchet source counts', () => {
    it('counts comment lines, escape hatches and useEffect from the AST', () => {
        const counts = countFile(
            'apps/web/src/Screen.tsx',
            [
                '// one',
                '/* two',
                '   three */',
                'const url = "http://not-a-comment";',
                '// @ts-expect-error -- deliberate',
                'const a = (x as any) as any;',
                '// eslint-disable-next-line no-console',
                'useEffect(() => {}, []);',
                'const el = <div>{/* four */}</div>;',
            ].join('\n')
        );
        expect(counts).toEqual({
            comments: 4,
            asAny: 2,
            tsIgnore: 0,
            tsExpectError: 1,
            eslintDisableNoReason: 1,
            useEffect: 1,
        });
    });

    it('does not count exempt comments', () => {
        const counts = countFile(
            'libs/chatic-apps-sdk/src/open.ts',
            [
                '/* SPDX-License-Identifier: Apache-2.0 */',
                '/// <reference types="node" />',
                '/** Opens a mini app. */',
                'export function open() {}',
                '// eslint-disable-next-line no-console -- prints on purpose',
                'console.log(1);',
                '// ratchet-allow asAny -- untyped global',
                'const g = (globalThis as any).x;',
            ].join('\n')
        );
        expect(counts.comments).toBe(0);
        expect(counts.asAny).toBe(0);
    });
});

describe('ratchet modes', () => {
    it('accepts off, observe and enforce for every kind', () => {
        expect(readModes('{"source":"enforce","knip":"observe","jscpd":"off","testTypecheck":"enforce"}')).toEqual({
            source: 'enforce',
            knip: 'observe',
            jscpd: 'off',
            testTypecheck: 'enforce',
        });
        expect(() => readModes('{"source":"enforce","knip":"warn","jscpd":"off","testTypecheck":"off"}')).toThrow(
            'knip must be one of off, observe, enforce'
        );
        expect(() => readModes('{"source":"enforce","knip":"observe"}')).toThrow('jscpd must be one of');
    });

    it('starts the comment and escape hatch ratchet enforced and the tool ratchets observed', () => {
        expect(readModes()).toEqual({ source: 'enforce', knip: 'observe', jscpd: 'observe', testTypecheck: 'enforce' });
    });
});

describe('ratchet CLI arguments', () => {
    it('reads the command, the kinds and the base', () => {
        expect(parseArgs(['verify-baseline', '--base', 'origin/develop'])).toMatchObject({
            command: 'verify-baseline',
            base: 'origin/develop',
            only: ['source', 'knip', 'jscpd', 'testTypecheck'],
        });
        expect(parseArgs(['check', '--only', 'source']).only).toEqual(['source']);
    });

    it('refuses an unknown kind or argument', () => {
        expect(() => parseArgs(['check', '--only', 'lint'])).toThrow('unknown kind lint');
        expect(() => parseArgs(['check', '--fast'])).toThrow('unknown argument --fast');
    });
});
