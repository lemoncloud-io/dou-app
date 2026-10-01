/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

// jsdom because the provider writes a class on <html> and reads matchMedia; the spec stubs the
// latter, which jsdom does not ship.
export default defineConfig({
    root: __dirname,
    cacheDir: '../../node_modules/.vite/libs/theme',
    plugins: [react(), nxViteTsPaths()],
    test: {
        watch: false,
        globals: true,
        environment: 'jsdom',
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        reporters: ['default'],
    },
});
