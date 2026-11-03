import { copyFileSync } from 'node:fs';
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
                copyFileSync(join(__dirname, 'README.md'), join(__dirname, outDir, 'README.md'));
            },
        },
    ],
    build: {
        outDir,
        emptyOutDir: true,
        reportCompressedSize: false,
        lib: {
            entry: { index: 'src/index.ts', mock: 'src/mock.ts' },
            formats: ['es', 'cjs'],
            fileName: (format, entry) => `${entry}.${format === 'es' ? 'js' : 'cjs'}`,
        },
    },
});
