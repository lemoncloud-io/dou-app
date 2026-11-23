/// <reference types='vitest' />
import { defineConfig } from 'vite';

import shellVite from './vite.shell.config.mts';

export default defineConfig({
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/apps/shell-adapter',
    ...shellVite,
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.spec.ts'],
        reporters: ['default'],
    },
});
