/// <reference types='vitest' />
import { defineConfig } from 'vite';

import shellVite from './vite.shell.config.mts';

/** The unit tests call the mobile route functions through the same aliases the shell page uses. */
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
