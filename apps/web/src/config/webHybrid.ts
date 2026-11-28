import {
    authLocation,
    checkoutNone,
    checkoutStore,
    checkoutWeb,
    defineRuntime,
    foregroundVisibility,
    transportBrowser,
    webHostFacts,
} from '@chatic/runtime-hybrid-web';
import type { SessionOwnerChoice, StorageStores, WebHostFacts } from '@chatic/runtime-hybrid-web';

import { cacheWebLocal } from './adapters/cache';
import { appShellBrowser, appShellHost, appShellShell } from './adapters/appShell';
import { checkoutAsDeclaredInHybrid, hybridWebCheckout, storeCheckout } from './adapters/checkout';
import { diagnosticsBrowser, diagnosticsHost, diagnosticsShell } from './adapters/diagnostics';
import { filesBrowser, filesHost, filesShell } from './adapters/files';
import { linksBrowser, linksHost, linksShell } from './adapters/links';
import { mediaBrowser, mediaHost, mediaShell } from './adapters/media';
import { pushBrowser, pushHost, pushShell } from './adapters/push';
import { signInBrowser, signInHost, signInShell } from './adapters/signIn';
import { engineMirrorRecorded } from './adapters/engine';
import { storageResolved } from './adapters/storage';
import { createWebConfigPorts } from './configPorts';
import { webRuntimePolicies, type WebRuntimeDeclaration } from './policies';
import { createShellKvAdapter } from './shellKvAdapter';
import { sessionMirrorDisabled } from './viteEnv';

export const webHybrid = (stores: StorageStores): WebRuntimeDeclaration =>
    defineRuntime<WebHostFacts, SessionOwnerChoice>({
        name: 'web-hybrid',
        facts: webHostFacts,
        ports: {
            storage: { default: storageResolved(stores) },
            transport: { default: transportBrowser },
            auth: { default: authLocation },
            db: { default: cacheWebLocal(stores) },
            foreground: { default: foregroundVisibility },
        },
        host: {
            checkout: {
                default: checkoutAsDeclaredInHybrid,
                alternatives: [checkoutStore(storeCheckout), checkoutWeb(() => hybridWebCheckout()), checkoutNone],
            },
            media: { default: mediaHost, alternatives: [mediaShell, mediaBrowser] },
            files: { default: filesHost, alternatives: [filesShell, filesBrowser] },
            links: { default: linksHost, alternatives: [linksShell, linksBrowser] },
            appShell: { default: appShellHost, alternatives: [appShellShell, appShellBrowser] },
            signIn: { default: signInHost, alternatives: [signInShell, signInBrowser] },
            diagnostics: { default: diagnosticsHost, alternatives: [diagnosticsShell, diagnosticsBrowser] },
            push: { default: pushHost, alternatives: [pushShell, pushBrowser] },
        },
        engine: { default: engineMirrorRecorded(sessionMirrorDisabled()) },
        constraints: [],
        config: createWebConfigPorts(stores, { shell: createShellKvAdapter() }),
        ...webRuntimePolicies,
    });
