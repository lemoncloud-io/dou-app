import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vite';

/**
 * The reference mini-app. Static files with `index.html` at the top and the manifest copied from
 * `public/`; no `base`, because the page is always served from the root of its own address. Source maps
 * stay out: the bundle is build output only.
 */
export default defineConfig({
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/apps/chatic-apps-example',
    // Maps the workspace's `@chatic/*` names to their sources; a page outside this repository imports
    // `@lemoncloud/chatic-apps-sdk` from npm instead and needs no plugin.
    plugins: [nxViteTsPaths()],
    server: { port: 5180, host: 'localhost' },
    build: {
        outDir: '../../dist/apps/chatic-apps-example',
        emptyOutDir: true,
        sourcemap: false,
        reportCompressedSize: false,
    },
});
