import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

/**
 * The script-tag build: one file that defines `window.ChaticAppsSDK`, for a page with no bundler.
 * Its own config because a script-tag build takes a single entry. The mock is left out — a page that
 * needs it has a bundler, or the module build.
 */
export default defineConfig({
    root: __dirname,
    cacheDir: '../../node_modules/.vite/libs/chatic-apps-sdk-global',
    plugins: [nxViteTsPaths()],
    build: {
        outDir: '../../dist/libs/chatic-apps-sdk',
        emptyOutDir: false,
        reportCompressedSize: false,
        lib: {
            entry: 'src/index.ts',
            name: 'ChaticAppsSDK',
            formats: ['iife'],
            fileName: () => 'chatic-apps-sdk.global.js',
        },
    },
});
