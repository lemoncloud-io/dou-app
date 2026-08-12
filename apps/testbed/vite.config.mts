/// <reference types='vitest' />
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

export default defineConfig({
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/apps/testbed',

    // Browser shims for node-oriented transitive deps (backend/socket libs expect these globals).
    define: {
        'process.env': {},
        global: 'window',
    },

    server: {
        port: 5003,
        host: 'localhost',
        fs: {
            allow: [searchForWorkspaceRoot(process.cwd())],
        },
    },

    preview: {
        port: 5003,
        host: 'localhost',
    },

    // nxViteTsPaths maps @chatic/* to libs/<name>/src per tsconfig.base paths (src, not dist).
    plugins: [react(), nxViteTsPaths()],

    build: {
        // PROD emits maps too, as 'hidden': no sourceMappingURL comment is left in the
        // bundle, so nothing points at a file that is not served. Deploy excludes *.map
        // and CI archives them, which is what makes this safe — see
        // libs/web-core/docs/error-reporting.md.
        sourcemap: process.env.VITE_ENV === 'PROD' ? 'hidden' : true,
        outDir: '../../dist/apps/testbed',
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
            reportsDirectory: '../../coverage/apps/testbed',
            provider: 'v8',
        },
    },
});
