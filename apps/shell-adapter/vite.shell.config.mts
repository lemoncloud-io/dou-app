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

const SHARED_FOR_DEEPLINKS = path.join(ROOT, 'libs/shared/src/utils/index.ts');
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
        return `export * from ${JSON.stringify(SHARED_FOR_DEEPLINKS)};`;
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

export const answeringOrigin = async (
    value: string | undefined,
    request: typeof fetch = globalThis.fetch
): Promise<string> => {
    if (!value?.trim()) return '';
    let origin: string;
    try {
        origin = new URL(value.trim()).origin;
    } catch {
        console.warn('[shell] DOU_SHELL_SUBSCRIPTION_WEB is not a URL; the deployed subscription website is used');
        return '';
    }
    try {
        await request(origin, { signal: AbortSignal.timeout(2000) });
        console.info(`[shell] subscription website: local ${origin}`);
        return origin;
    } catch {
        console.warn(`[shell] ${origin} does not answer; the deployed subscription website is used`);
        return '';
    }
};

export const shellCheckoutValues = (): Plugin => {
    let subscriptionWeb: Promise<string> | undefined;
    return {
        name: 'shell-adapter:checkout-values',
        async transform(code, id) {
            if (!id.split('?')[0].endsWith('/apps/shell-adapter/src/checkout.ts')) return null;
            subscriptionWeb ??= answeringOrigin(process.env['DOU_SHELL_SUBSCRIPTION_WEB']);
            const verified = await subscriptionWeb;
            return code
                .replaceAll('__DOU_SHELL_CHECKOUT__', JSON.stringify(process.env['DOU_SHELL_CHECKOUT'] ?? ''))
                .replaceAll('__DOU_SHELL_MEDIA__', JSON.stringify(process.env['DOU_SHELL_MEDIA'] ?? ''))
                .replaceAll('__DOU_SHELL_FILES__', JSON.stringify(process.env['DOU_SHELL_FILES'] ?? ''))
                .replaceAll('__DOU_SHELL_SUBSCRIPTION_WEB__', JSON.stringify(verified))
                .replaceAll('__DOU_SHELL_STORE_SKUS__', JSON.stringify(STORE_SKUS));
        },
    };
};

export default {
    define: {
        'process.env': {},
        global: 'window',
    },
    resolve: { alias: MOBILE_ALIASES },
    plugins: [sharedInviteLinkForDeeplinks(), shellCheckoutValues(), nxViteTsPaths()],
} satisfies UserConfig;
