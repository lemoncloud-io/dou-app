/// <reference types='vitest' />
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

export default defineConfig({
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/apps/admin-v2',

    // Browser shims for node-oriented transitive deps (backend/socket libs expect these globals).
    define: {
        'process.env': {},
        global: 'window',
    },

    server: {
        port: 5001,
        host: 'localhost',
        fs: {
            allow: [searchForWorkspaceRoot(process.cwd())],
        },
    },

    preview: {
        port: 5001,
        host: 'localhost',
    },

    // nxViteTsPaths maps @chatic/* to libs/<name>/src per tsconfig.base paths (src, not dist).
    plugins: [react(), nxViteTsPaths()],

    build: {
        sourcemap: process.env.VITE_ENV !== 'PROD',
        outDir: '../../dist/apps/admin-v2',
        emptyOutDir: true,
        // Some backend/socket deps ship CommonJS with mixed ES modules; keep interop on.
        commonjsOptions: {
            include: [/node_modules/],
            extensions: ['.js', '.cjs'],
            strictRequires: true,
            transformMixedEsModules: true,
        },
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
            reportsDirectory: '../../coverage/apps/admin-v2',
            provider: 'v8',
        },
    },
});
