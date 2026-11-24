const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const MODULE = path.join(ROOT, 'docs/config/skills/dou-ship/references/review-items.mjs');

const evaluate = expression =>
    JSON.parse(
        execFileSync(
            'node',
            [
                '--input-type=module',
                '-e',
                `import * as m from ${JSON.stringify(MODULE)}; import fs from 'node:fs'; const items = m.parseItems(fs.readFileSync(${JSON.stringify(path.join(ROOT, 'REVIEW.md'))}, 'utf8')); console.log(JSON.stringify(${expression}));`,
            ],
            { encoding: 'utf8' }
        )
    );

describe('review-items', () => {
    it('parses every REVIEW.md item with a trigger, a check and evidence', () => {
        const items = evaluate('items');
        expect(items.length).toBeGreaterThanOrEqual(10);
        for (const item of items) {
            expect(item.paths.length + (item.diff ? 1 : 0)).toBeGreaterThan(0);
            expect(item.check).not.toBe('');
            expect(item.from).not.toBe('');
        }
    });

    it('fires an item on a matching path', () => {
        const titles = evaluate("m.fired(items, ['libs/session/src/storage/keys.ts'], '').map(i => i.title)");
        expect(titles).toContain('An app updated from the previous release still boots signed in');
    });

    it('fires an item on a matching changed line even when no path matches', () => {
        const titles = evaluate(
            "m.fired(items, ['apps/web/src/x.ts'], '+ const key = SESSION_KEYS.token').map(i => i.title)"
        );
        expect(titles).toContain('An app updated from the previous release still boots signed in');
    });

    it('fires nothing for an unrelated change', () => {
        expect(evaluate("m.fired(items, ['apps/landing/src/pages/About.tsx'], '+ const title = 1').length")).toBe(0);
    });

    it('keeps changed lines that start with + or - and drops the file headers', () => {
        const lines = evaluate(
            "m.changedLinesOf(['--- a/x.ts', '+++ b/x.ts', '+- item', '--flag', '+const a = 1', ' context'].join('\\n'))"
        );
        expect(lines.split('\n')).toEqual(['+- item', '--flag', '+const a = 1']);
    });

    it('counts an item with no paths as fired when a commit in the window matches its diff', () => {
        const log = ['', 'aaa\n+ const n = history.length', 'bbb\n+ const a = 1'].join('\0');
        expect(
            evaluate(
                `[m.diffFiredIn({ diff: 'history\\\\.length', paths: [] }, m.changedLinesPerCommit(${JSON.stringify(log)})), m.diffFiredIn({ diff: 'nope', paths: [] }, m.changedLinesPerCommit(${JSON.stringify(log)}))]`
            )
        ).toEqual([true, false]);
    });

    it('anchors globs to the repository root', () => {
        expect(
            evaluate(
                "[m.globToRegExp('package.json').test('apps/web/package.json'), m.globToRegExp('libs/a/**').test('libs/a/b/c.ts')]"
            )
        ).toEqual([false, true]);
    });
});
