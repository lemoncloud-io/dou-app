import * as path from 'path';

import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import type { Plugin, UserConfig } from 'vite';

const ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * The mobile app's route functions, reached through an alias rather than an import: a relative import
 * breaks `@nx/enforce-module-boundaries`, and either form would make `@chatic/mobile` a dependency of
 * this project, whose typecheck would then build the mobile app. Their types are declared by hand in
 * `src/mobile.d.ts`; `routes.spec.ts` calls them through this same alias.
 */
export const MOBILE_ALIASES = {
    'shell-adapter/mobile-deeplink': path.join(ROOT, 'apps/mobile/src/app/services/deeplinks/deeplinkUtils.ts'),
    // `deeplinkUtils.ts` reads one value from react-native-config: `VITE_ENV`, for the custom scheme.
    'react-native-config': path.join(import.meta.dirname, 'src/stubs/reactNativeConfig.ts'),
};

/**
 * `deeplinkUtils.ts` takes its invite-link decoder from the `@chatic/shared` barrel, which also carries
 * React components, image assets and the web's config. Only that one importer is pointed at the module
 * the two functions live in — the same code, without the rest of the barrel.
 */
export const sharedInviteLinkForDeeplinks = (): Plugin => ({
    name: 'shell-adapter:shared-invite-link',
    enforce: 'pre',
    resolveId(source, importer) {
        if (source !== '@chatic/shared' || !importer?.endsWith('/deeplinks/deeplinkUtils.ts')) return null;
        return path.join(ROOT, 'libs/shared/src/utils/inviteLink.ts');
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
    plugins: [sharedInviteLinkForDeeplinks(), nxViteTsPaths()],
} satisfies UserConfig;
