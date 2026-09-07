/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

// The lib carries its own runner because CLAUDE.md's gate — "changed a libs/*
// barrel? run that lib's own suite" — needs one to point at. jsdom mirrors
// apps/desktop-web: BlockKitMessage renders, so a node environment would fail on
// document access rather than on anything this lib got wrong.
export default defineConfig({
    root: __dirname,
    cacheDir: '../../node_modules/.vite/libs/block-kit',
    plugins: [react(), nxViteTsPaths()],
    test: {
        watch: false,
        globals: true,
        environment: 'jsdom',
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        reporters: ['default'],
    },
});
