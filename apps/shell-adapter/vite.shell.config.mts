import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import type { Plugin, UserConfig } from 'vite';

const ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * The mobile app's route functions and URL rules, reached through an alias rather than an import: a relative import
 * breaks `@nx/enforce-module-boundaries`, and either form would make `@chatic/mobile` a dependency of
 * this project, whose typecheck would then build the mobile app. Their types are declared by hand in
 * `src/mobile.d.ts`; `routes.spec.ts` and `handlers.spec.ts` call them through this same alias.
 */
export const MOBILE_ALIASES = {
    'shell-adapter/mobile-deeplink': path.join(ROOT, 'apps/mobile/src/app/services/deeplinks/deeplinkUtils.ts'),
    // Which URLs the app lets the web open, so the shell's `OpenURL` refuses what the app refuses.
    'shell-adapter/mobile-url-trust': path.join(ROOT, 'apps/mobile/src/app/webview/utils/urlTrust.ts'),
    // `deeplinkUtils.ts` reads one value from react-native-config: `VITE_ENV`, for the custom scheme.
    'react-native-config': path.join(import.meta.dirname, 'src/stubs/reactNativeConfig.ts'),
};

/**
 * `deeplinkUtils.ts` takes its invite-link decoder and sub WebView link readers from the `@chatic/shared`
 * barrel, which also carries React components, image assets and the web's config. Only that one importer
 * is pointed at a virtual module re-exporting the modules those functions live in — the same code,
 * without the rest of the barrel. A new `@chatic/shared` import in `deeplinkUtils.ts` has to be added to
 * `SHARED_DEEPLINK_MODULES`.
 */
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

/**
 * The store SKUs the mobile app sells on dev, from the one file its dev build reads
 * (`apps/mobile/.env.dev`), so the virtual store's catalog joins the server's plans the way the app's
 * does. Only that file: falling back to another one could mix in production SKUs. A missing file is an
 * empty catalog, which the virtual store logs. Dev only: the virtual store never answers on prod.
 */
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

/**
 * How this shell sells (`DOU_SHELL_CHECKOUT=web yarn local`, for one), who picks attachments
 * (`DOU_SHELL_MEDIA=browser`), who moves files (`DOU_SHELL_FILES=browser`) and the store SKUs, written into
 * `src/checkout.ts` where it names them. Not Vite's `define`: in dev that sets globals through Vite's
 * client script, which the shell page never loads. The config also reads `checkout.ts` in Node, where
 * the names stay undefined and the module answers "no choice".
 */
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

/**
 * What the virtual shell's server adds to its own Vite settings (`shell.viteConfig` in
 * `hybrid-shell.config.ts`), for the handler module and the route functions the shell page imports.
 */
export default {
    define: {
        // `@chatic/logger` and friends, reached through `@chatic/fake-shell`, expect these.
        'process.env': {},
        global: 'window',
    },
    resolve: { alias: MOBILE_ALIASES },
    plugins: [sharedInviteLinkForDeeplinks(), shellCheckoutValues(), nxViteTsPaths()],
} satisfies UserConfig;
