import { copyFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';

import { defineConfig } from 'vite';

/**
 * The package for Node: the API (`index.js`) and the command (`cli.js`), as ES modules. Its two
 * dependencies, `esbuild` and `jsdom`, stay outside the bundle, as do Node's own modules.
 */
const outDir = '../../dist/libs/chatic-apps-devtools';

export default defineConfig({
    root: __dirname,
    cacheDir: '../../node_modules/.vite/libs/chatic-apps-devtools',
    build: {
        outDir,
        emptyOutDir: true,
        reportCompressedSize: false,
        target: 'node18',
        minify: false,
        lib: {
            entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
            formats: ['es'],
            fileName: (_format, name) => `${name}.js`,
        },
        rollupOptions: {
            external: ['esbuild', 'jsdom', ...builtinModules, ...builtinModules.map(name => `node:${name}`)],
            output: {
                chunkFileNames: '[name].js',
                banner: chunk => (chunk.name === 'cli' ? '#!/usr/bin/env node' : ''),
            },
        },
    },
    plugins: [
        {
            // The workspace manifest points at sources; the published one is written beside the build.
            name: 'publish-manifest',
            closeBundle() {
                copyFileSync(join(__dirname, 'package.publish.json'), join(__dirname, outDir, 'package.json'));
                copyFileSync(join(__dirname, 'README.md'), join(__dirname, outDir, 'README.md'));
            },
        },
    ],
});
