import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

const outDir = '../../dist/libs/chatic-apps-sdk';

/**
 * The published package: ES modules and CommonJS for the main entry and `./mock`, each with one
 * self-contained declaration file — no relative imports for a `nodenext` project to fail on, and no
 * internal file's declarations shipped — copied as `.d.cts` for CommonJS consumers. The sources import
 * nothing outside this library, so the declarations stand on their own. The script-tag build is
 * `vite.global.config.mts`, run after this one.
 */
export default defineConfig({
    root: __dirname,
    cacheDir: '../../node_modules/.vite/libs/chatic-apps-sdk',
    plugins: [
        nxViteTsPaths(),
        dts({
            tsconfigPath: join(__dirname, 'tsconfig.lib.json'),
            entryRoot: 'src',
            rollupTypes: true,
        }),
        {
            // The workspace manifest points at sources; the published one is written beside the build.
            name: 'publish-manifest',
            closeBundle() {
                for (const entry of ['index', 'mock']) {
                    copyFileSync(join(__dirname, outDir, `${entry}.d.ts`), join(__dirname, outDir, `${entry}.d.cts`));
                }
                copyFileSync(join(__dirname, 'package.publish.json'), join(__dirname, outDir, 'package.json'));
                // The README, the guide and the rules for an assistant ship under the names a developer and
                // an assistant look for, each with its Korean translation beside it (`.ko.md`).
                const docs: [string, string][] = [
                    ['README', 'README'],
                    ['docs/guide/README', 'GUIDE'],
                    ['docs/guide/agent-rules', 'AGENTS'],
                ];
                for (const [source, shipped] of docs) {
                    copyFileSync(join(__dirname, `${source}.md`), join(__dirname, outDir, `${shipped}.md`));
                    copyFileSync(join(__dirname, `${source}.ko.md`), join(__dirname, outDir, `${shipped}.ko.md`));
                }
                // The skill ships as a folder of its own, so a project copies it whole.
                mkdirSync(join(__dirname, outDir, 'skill'), { recursive: true });
                for (const name of ['SKILL.md', 'SKILL.ko.md']) {
                    copyFileSync(join(__dirname, 'skill', name), join(__dirname, outDir, 'skill', name));
                }
            },
        },
    ],
    build: {
        outDir,
        emptyOutDir: true,
        reportCompressedSize: false,
        lib: {
            entry: { index: 'src/index.ts', mock: 'src/mock.ts' },
        },
        rollupOptions: {
            // Named per format, chunks too: the published package is `"type": "module"`, so ES modules
            // are `.js` and CommonJS `.cjs`. Vite's own chunk names follow this workspace's manifest,
            // which has no type, and would ship an `.mjs` the package's `files` leave out.
            output: [
                { format: 'es', entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' },
                { format: 'cjs', entryFileNames: '[name].cjs', chunkFileNames: '[name]-[hash].cjs' },
            ],
        },
    },
});
