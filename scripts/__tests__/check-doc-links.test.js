const { checkFile } = require('../check-doc-links');

// The documents are stated inline; only the link targets are real repo paths, since
// resolving them is the thing under test.
const check = source => checkFile('docs/adr/0001-desktop-remote-web-load.md', source);

describe('check-doc-links', () => {
    it('accepts a link to a file that exists', () => {
        expect(check('see [the readme](../../README.md)')).toEqual([]);
    });

    it('reports a link to a file that does not exist', () => {
        const [problem] = check('see [gone](../../libs/web-core/src/api/common.ts)');
        expect(problem).toContain('dead link');
    });

    it('accepts the `path:line` convention', () => {
        expect(check('see [AGENTS.md:1](../../AGENTS.md:1)')).toEqual([]);
    });

    it('accepts an ADR link whose label matches the file it points at', () => {
        expect(check('[ADR-0033](./0033-app-update-check-ios-first.md)')).toEqual([]);
    });

    it('reports an ADR link whose label names a different number than the file', () => {
        const [problem] = check('[ADR-0033](./0089-relay-dm-invite-and-auth-parallel-tracks.md)');
        expect(problem).toContain('ADR mismatch');
        expect(problem).toContain('the label says 0033, the file is 0089');
    });

    it('checks a backticked ADR label the same way', () => {
        const [problem] = check('[`ADR-0033`](./0089-relay-dm-invite-and-auth-parallel-tracks.md)');
        expect(problem).toContain('ADR mismatch');
    });

    it('leaves a non-ADR label alone even when it points at an ADR', () => {
        expect(check('[the relay DM decision](./0089-relay-dm-invite-and-auth-parallel-tracks.md)')).toEqual([]);
    });

    it('ignores links inside a fenced block', () => {
        expect(check('```md\n[example](./0000-does-not-exist.md)\n```')).toEqual([]);
    });

    it('ignores a whole link shown inside a code span', () => {
        expect(check('the shape it rejects is `[ADR-0033](./0089-relay-dm-invite.md)`')).toEqual([]);
    });

    it('still checks a real link sitting between two code spans', () => {
        const [problem] = check('`a` [gone](./0000-does-not-exist.md) `b`');
        expect(problem).toContain('dead link');
    });

    it('ignores external and anchor-only links', () => {
        expect(check('[a](https://example.com/x.md) [b](mailto:x@y.z) [c](#section)')).toEqual([]);
    });

    it('resolves an anchor on a real file', () => {
        expect(check('[a heading](../../README.md#getting-started)')).toEqual([]);
    });
});
