import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import type { Plugin, UserConfig } from 'vite';

const ROOT = path.resolve(import.meta.dirname, '../..');

export const MOBILE_ALIASES = {
    'shell-adapter/mobile-deeplink': path.join(ROOT, 'apps/mobile/src/app/services/deeplinks/deeplinkUtils.ts'),
    'shell-adapter/mobile-url-trust': path.join(ROOT, 'apps/mobile/src/app/webview/utils/urlTrust.ts'),
    'react-native-config': path.join(import.meta.dirname, 'src/stubs/reactNativeConfig.ts'),
};

const SHARED_DEEPLINK_MODULES = ['libs/shared/src/utils/inviteLink.ts', 'libs/shared/src/utils/subWebViewLink.ts'];
const VIRTUAL_SHARED = '\0shell-adapter:shared-for-deeplinks';

export const sharedInviteLinkForDeeplinks = (): Plugin => ({
    name: 'shell-adapter:shared-invite-link',
    enforce: 'pre',
    resolveId(source, importer) {
        if (source !== '@chatic/shared' || !importer?.endsWith('/deeplinks/deeplinkUtils.ts')) return null;
        return VIRTUAL_SHARED;
    },
    load(id) {
        if (id !== VIRTUAL_SHARED) return null;
        return SHARED_DEEPLINK_MODULES.map(file => `export * from ${JSON.stringify(path.join(ROOT, file))};`).join(
            '\n'
        );
    },
});

const listOf = (value: string | undefined): string[] =>
    (value ?? '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

const readEnvFile = (file: string): Record<string, string> => {
    if (!existsSync(file)) return {};
    return Object.fromEntries(
        readFileSync(file, 'utf8')
            .split(/\r?\n/)
            .map(line => /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line))
            .filter((match): match is RegExpExecArray => !!match)
            .map(([, key, value]) => [key, value.replace(/^(['"])(.*)\1$/, '$2')])
    );
};
const mobileDevEnv = readEnvFile(path.join(ROOT, 'apps/mobile/.env.dev'));
const STORE_SKUS = {
    ios: listOf(mobileDevEnv['VITE_SUBSCRIPTION_IAP_SKUS_IOS']),
    android: listOf(mobileDevEnv['VITE_SUBSCRIPTION_IAP_SKUS_ANDROID']),
    androidPlans: listOf(mobileDevEnv['VITE_SUBSCRIPTION_IAP_PLANS_ANDROID']),
};

export const shellCheckoutValues = (): Plugin => ({
    name: 'shell-adapter:checkout-values',
    transform(code, id) {
        if (!id.split('?')[0].endsWith('/apps/shell-adapter/src/checkout.ts')) return null;
        return code
            .replaceAll('__DOU_SHELL_CHECKOUT__', JSON.stringify(process.env['DOU_SHELL_CHECKOUT'] ?? ''))
            .replaceAll('__DOU_SHELL_MEDIA__', JSON.stringify(process.env['DOU_SHELL_MEDIA'] ?? ''))
            .replaceAll('__DOU_SHELL_FILES__', JSON.stringify(process.env['DOU_SHELL_FILES'] ?? ''))
            .replaceAll('__DOU_SHELL_STORE_SKUS__', JSON.stringify(STORE_SKUS));
    },
});

export default {
    define: {
        'process.env': {},
        global: 'window',
    },
    resolve: { alias: MOBILE_ALIASES },
    plugins: [sharedInviteLinkForDeeplinks(), shellCheckoutValues(), nxViteTsPaths()],
} satisfies UserConfig;
