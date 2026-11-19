import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { buildSync } from 'esbuild';

/** The reference mini-app, which these tests run the tools against, by its folder (it is no import). */
export const EXAMPLE = resolve(__dirname, '../../../../apps/chatic-apps-example');
const SDK = resolve(__dirname, '../../../chatic-apps-sdk/src');

/** A change to one of the example's files: `from` must be found, so a stale variant fails loudly. */
export interface Edit {
    file: string;
    from: string | RegExp;
    to: string;
}

export const applyEdits = (file: string, text: string, edits: Edit[]): string =>
    edits
        .filter(edit => file.endsWith(edit.file))
        .reduce((out, edit) => {
            const next = out.replace(edit.from, edit.to);
            if (next === out) throw new Error(`${edit.file}: ${String(edit.from)} was not found.`);
            return next;
        }, text);

/**
 * A copy of the example in a folder of its own, built the way Vite builds it — `index.html` at the top,
 * the manifest copied from `public/`, one script under `assets/` — with `edits` applied to the sources
 * first and `afterBuild` free to change the bundle. Returns the folder; remove it with `cleanup`.
 */
export const buildVariant = (edits: Edit[] = [], afterBuild?: (dist: string) => void): string => {
    const root = mkdtempSync(join(tmpdir(), 'chatic-apps-variant-'));
    for (const part of ['index.html', 'public', 'src']) {
        cpSync(join(EXAMPLE, part), join(root, part), { recursive: true });
    }
    for (const edit of edits) {
        const path = join(root, edit.file);
        writeFileSync(path, applyEdits(edit.file, readFileSync(path, 'utf8'), [edit]));
    }
    const dist = join(root, 'dist');
    mkdirSync(join(dist, 'assets'), { recursive: true });
    buildSync({
        entryPoints: [join(root, 'src/main.ts')],
        outfile: join(dist, 'assets/index.js'),
        bundle: true,
        format: 'esm',
        minify: true,
        logLevel: 'silent',
        loader: { '.css': 'empty' },
        alias: {
            '@chatic/chatic-apps-sdk/mock': join(SDK, 'mock.ts'),
            '@chatic/chatic-apps-sdk': join(SDK, 'index.ts'),
        },
        define: { 'import.meta.env.DEV': 'false' },
    });
    writeFileSync(
        join(dist, 'index.html'),
        readFileSync(join(root, 'index.html'), 'utf8').replace('/src/main.ts', '/assets/index.js')
    );
    cpSync(join(root, 'public'), dist, { recursive: true });
    afterBuild?.(dist);
    return root;
};

export const cleanup = (root: string) => rmSync(root, { recursive: true, force: true });

/** Writes `text` at `path` under `root`, making its folder. */
export const put = (root: string, path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
};
