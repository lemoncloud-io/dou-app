import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadScenarioConfig } from './config';
import { loadEntry } from './page';
import { runScenarios, type ScenarioName, type ScenarioResult } from './scenarios';
import { EXAMPLE, applyEdits, type Edit } from './testing/example';

const PERMISSIONS = JSON.parse(readFileSync(join(EXAMPLE, 'public/.well-known/chatic-app.json'), 'utf8'))
    .permissions as string[];
const { config } = loadScenarioConfig(EXAMPLE);

/** Runs the example, with `edits` applied to its sources, through `only` (every scenario by default). */
const run = async (edits: Edit[] = [], only?: ScenarioName[]): Promise<ScenarioResult[]> =>
    runScenarios({
        source: await loadEntry({
            html: readFileSync(join(EXAMPLE, 'index.html'), 'utf8'),
            entry: join(EXAMPLE, 'src/main.ts'),
            transform: (path, text) => applyEdits(path, text, edits),
        }),
        permissions: PERMISSIONS,
        config,
        mockModule: '@chatic/chatic-apps-sdk/mock',
        resolveDir: EXAMPLE,
        only,
    });

const problemsOf = (results: ScenarioResult[], name: ScenarioName) =>
    results.find(result => result.name === name)?.problems ?? [];

const APP = 'src/app.ts';

describe('runScenarios', () => {
    it('passes the reference mini-app, every scenario run', async () => {
        const results = await run();
        expect(results.filter(result => result.problems.length > 0)).toEqual([]);
        expect(results.every(result => result.ran)).toBe(true);
    }, 60_000);

    it('fails a page whose screens do not take Android back', async () => {
        const results = await run(
            [
                {
                    file: APP,
                    from: 'const syncBack = () => apps.onBack(stack.length > 1 ? back : null);',
                    to: 'const syncBack = () => undefined;',
                },
            ],
            ['screens']
        );
        expect(problemsOf(results, 'screens')).toEqual(
            expect.arrayContaining([expect.stringContaining('rooms: the screen does not take Android back')])
        );
    }, 30_000);

    it('fails a page that leaves a stream open after back', async () => {
        const results = await run([{ file: APP, from: 'void stream?.stop();', to: 'void stream;' }], ['screens']);
        expect(problemsOf(results, 'screens')).toEqual(
            expect.arrayContaining([expect.stringContaining('rooms: 1 stream(s) left open after back')])
        );
    }, 30_000);

    it('fails a page that leaves a listener or an interval behind', async () => {
        const results = await run(
            [
                {
                    file: APP,
                    from: "const list = h('ul', { 'data-field': 'rooms' });",
                    to: "const list = h('ul', { 'data-field': 'rooms' }); window.addEventListener('resize', () => undefined); setInterval(() => undefined, 1000);",
                },
            ],
            ['screens']
        );
        expect(problemsOf(results, 'screens')).toEqual(
            expect.arrayContaining([
                expect.stringContaining('rooms: 1 event listener(s) left after back'),
                expect.stringContaining('rooms: 1 interval(s) left after back'),
            ])
        );
    }, 30_000);

    it('counts no listener a page removes with an AbortSignal', async () => {
        const results = await run(
            [
                {
                    file: APP,
                    from: "const list = h('ul', { 'data-field': 'rooms' });",
                    to: "const list = h('ul', { 'data-field': 'rooms' }); const aborter = new AbortController(); window.addEventListener('resize', () => undefined, { signal: aborter.signal });",
                },
                {
                    file: APP,
                    from: 'void stream?.stop();',
                    to: 'void stream?.stop();\n                aborter.abort();',
                },
            ],
            ['screens']
        );
        expect(problemsOf(results, 'screens')).toEqual([]);
    }, 30_000);

    it('fails a page that draws a whole long list', async () => {
        const results = await run(
            [
                {
                    file: APP,
                    from: 'const rows = (result?.list ?? []).slice(0, SHOWN_ROWS);',
                    to: 'const rows = result?.list ?? [];',
                },
            ],
            ['big-list']
        );
        expect(problemsOf(results, 'big-list')).toEqual([expect.stringContaining('rooms: ')]);
    }, 30_000);

    it('fails a page that does not save when hidden', async () => {
        const results = await run(
            [
                {
                    file: APP,
                    from: "document.addEventListener('visibilitychange', onVisibility);",
                    to: 'void onVisibility;',
                },
            ],
            ['hide-resume']
        );
        expect(problemsOf(results, 'hide-resume')).toEqual([expect.stringContaining('did not save')]);
    }, 30_000);

    it('fails a page that does not follow the theme', async () => {
        const results = await run(
            [{ file: APP, from: 'apps.onContextChange(context => applyTheme(context.theme));', to: '' }],
            ['theme']
        );
        expect(problemsOf(results, 'theme')).toEqual([expect.stringContaining('did not change')]);
    }, 30_000);

    it('fails a page that asks again after a refused consent', async () => {
        const results = await run(
            [
                {
                    file: APP,
                    from: "dataState = 'refused';\n                return refreshHome();",
                    to: "dataState = 'refused';\n                return startData();",
                },
            ],
            ['consent-refused']
        );
        expect(problemsOf(results, 'consent-refused')).toEqual([expect.stringContaining('asked again')]);
    }, 30_000);

    it('fails a page that ignores a cloud change', async () => {
        const results = await run(
            [{ file: APP, from: 'apps.data.onCloudChanged(() => {', to: 'void (() => {' }],
            ['cloud-change']
        );
        expect(problemsOf(results, 'cloud-change')).toEqual([expect.stringContaining('did not react')]);
    }, 30_000);

    it('fails a page that never retries a rate-limited read', async () => {
        const results = await run(
            [
                {
                    file: APP,
                    from: 'await new Promise(resolve => setTimeout(resolve, wait));\n        return read();',
                    to: 'void wait;\n        throw error;',
                },
            ],
            ['rate-limited']
        );
        expect(problemsOf(results, 'rate-limited')).toEqual(
            expect.arrayContaining([expect.stringContaining('never tried again')])
        );
    }, 30_000);

    it('fails a page that takes Android back at its root', async () => {
        const results = await run(
            [{ file: APP, from: 'apps.onBack(stack.length > 1 ? back : null)', to: 'apps.onBack(back)' }],
            ['start', 'back-at-root']
        );
        expect(problemsOf(results, 'start')).toEqual([expect.stringContaining('takes Android back at its root')]);
        expect(problemsOf(results, 'back-at-root')).toEqual([expect.stringContaining('did not close the page')]);
    }, 30_000);
});
