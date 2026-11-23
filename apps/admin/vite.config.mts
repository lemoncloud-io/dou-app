/// <reference types='vitest' />
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

export default defineConfig({
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/apps/admin',

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

    plugins: [react(), nxViteTsPaths()],

    build: {
        // PROD emits maps too, as 'hidden': no sourceMappingURL comment is left in the
        sourcemap: process.env.VITE_ENV === 'PROD' ? 'hidden' : true,
        outDir: '../../dist/apps/admin',
        emptyOutDir: true,
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
            reportsDirectory: '../../coverage/apps/admin',
            provider: 'v8',
        },
    },
});
