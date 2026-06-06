import { resolve } from 'node:path';

import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// @chatic/bridges is consumed as workspace source, so resolve the alias the way the rest
// of the monorepo does (see tsconfig.base.json paths) instead of treating it as external.
const bridgesAlias = {
    '@chatic/bridges': resolve(__dirname, '../../libs/bridges/src/index.ts'),
    '@chatic/app-messages': resolve(__dirname, '../../libs/app-messages/src/index.ts'),
};

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
        resolve: { alias: bridgesAlias },
        build: {
            lib: { entry: resolve(__dirname, 'src/main/index.ts') },
        },
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        resolve: { alias: bridgesAlias },
        build: {
            lib: { entry: resolve(__dirname, 'src/preload/index.ts') },
        },
    },
});
