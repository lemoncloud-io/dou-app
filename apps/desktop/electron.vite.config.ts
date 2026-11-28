import { resolve } from 'node:path';

import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const bridgesAlias = {
    '@chatic/bridges': resolve(__dirname, '../../libs/bridges/src/index.ts'),
    '@chatic/bridge-client': resolve(__dirname, '../../libs/bridge/client/src/index.ts'),
    '@chatic/bridge-host': resolve(__dirname, '../../libs/bridge/host/src/index.ts'),
    '@chatic/bridge-messages': resolve(__dirname, '../../libs/bridge-messages/src/index.ts'),
    '@chatic/logger': resolve(__dirname, '../../libs/logger/src/index.ts'),
    '@chatic/mini-app-host': resolve(__dirname, '../../libs/mini-app/host/src/index.ts'),
    '@chatic/mini-app-protocol': resolve(__dirname, '../../libs/mini-app/protocol/src/index.ts'),
    '@chatic/push-desktop': resolve(__dirname, '../../libs/push/desktop/src/index.ts'),
    '@chatic/storage-safe-storage': resolve(__dirname, '../../libs/storage/safe-storage/src/index.ts'),
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
            lib: {
                entry: {
                    index: resolve(__dirname, 'src/preload/index.ts'),
                    subWebView: resolve(__dirname, 'src/preload/subWebView.ts'),
                },
            },
        },
    },
});
