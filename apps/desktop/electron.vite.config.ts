import { resolve } from 'node:path';

import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// @chatic/bridges is consumed as workspace source, so resolve the alias the way the rest
// of the monorepo does (see tsconfig.base.json paths) instead of treating it as external.
// @chatic/logger is the platform-neutral logging core re-exported by @chatic/bridges, so it
// must be aliased here too — the SSR main/preload build reads this map, not tsconfig paths.
const bridgesAlias = {
    '@chatic/bridges': resolve(__dirname, '../../libs/bridges/src/index.ts'),
    '@chatic/bridge-messages': resolve(__dirname, '../../libs/bridge-messages/src/index.ts'),
    '@chatic/logger': resolve(__dirname, '../../libs/logger/src/index.ts'),
    // One file of @chatic/shared, not its barrel: the barrel carries React components, which have no
    // place in the main process. The file imports nothing, so aliasing it alone is enough.
    '@chatic/shared/subWebViewTrust': resolve(__dirname, '../../libs/shared/src/utils/subWebViewTrust.ts'),
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
            // Two preloads: the main window's, and the sub view's own, which exposes only the page channel.
            lib: {
                entry: {
                    index: resolve(__dirname, 'src/preload/index.ts'),
                    subWebView: resolve(__dirname, 'src/preload/subWebView.ts'),
                },
            },
        },
    },
});
