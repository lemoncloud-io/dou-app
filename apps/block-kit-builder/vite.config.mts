/// <reference types='vitest' />
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

// No `define` shims here, unlike the other apps: the builder talks to nothing.
// It composes a payload and renders it, so the socket and backend libraries that
// need `process.env`/`global` never get imported.
export default defineConfig({
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/apps/block-kit-builder',

    server: {
        port: 5006,
        host: 'localhost',
        fs: {
            allow: [searchForWorkspaceRoot(process.cwd())],
        },
    },

    preview: {
        port: 5006,
        host: 'localhost',
    },

    // nxViteTsPaths maps @chatic/* to libs/<name>/src per tsconfig.base paths.
    plugins: [react(), nxViteTsPaths()],

    build: {
        outDir: '../../dist/apps/block-kit-builder',
        emptyOutDir: true,
        sourcemap: true,
    },

    test: {
        globals: true,
        cache: {
            dir: '../../node_modules/.vitest',
        },
        environment: 'jsdom',
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        reporters: ['default'],
        coverage: {
            reportsDirectory: '../../coverage/apps/block-kit-builder',
            provider: 'v8',
        },
    },
});
