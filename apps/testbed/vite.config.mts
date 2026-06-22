/// <reference types='vitest' />
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/apps/testbed',

    optimizeDeps: {
        exclude: ['react-native'],
    },

    define: {
        global: 'globalThis',
        'process.env': {},
    },

    resolve: {
        alias: {
            'react-native': 'react-native-web',
        },
    },

    server: {
        port: 5003,
        host: 'localhost',
        proxy: {
            '/proxy': {
                target: 'https://api.eureka.codes',
                changeOrigin: true,
                rewrite: path => path.replace(/^\/proxy/, ''),
            },
        },
    },

    preview: {
        port: 5003,
        host: 'localhost',
    },

    plugins: [react(), nxViteTsPaths()],

    build: {
        outDir: '../../dist/apps/testbed',
        emptyOutDir: true,
        reportCompressedSize: true,
    },

    test: {
        globals: true,
        environment: 'jsdom',
        include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    },
});
