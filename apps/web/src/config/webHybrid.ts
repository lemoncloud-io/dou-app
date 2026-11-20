import {
    authLocation,
    checkoutNone,
    checkoutStore,
    checkoutWeb,
    defineRuntime,
    foregroundVisibility,
    transportBrowser,
    webHostFacts,
} from '@chatic/runtime-web';
import type { SessionOwnerChoice, StorageStores, WebHostFacts } from '@chatic/runtime-web';

import { cacheWebLocal } from './adapters/cache';
import { appShellBrowser, appShellHost, appShellShell } from './adapters/appShell';
import { checkoutAsDeclared, storeCheckout, webCheckout } from './adapters/checkout';
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

/**
 * `web-hybrid` — apps/web inside a shell: the phone app's WebView, or the virtual shell that plays it.
 *
 * Every runtime port is fixed to what the entry built before declarations: the session on the stores
 * the entry resolved (the device vault, loaded before the boot, where the shell keeps one; `localStorage`
 * in a shell from before the vault), the page's own network, address and visibility, and the page's
 * cache routing — the shell's SQLite for what the installed shell holds — over the same tab store.
 *
 * The engine is `engine.mirror`: before any port is built it settles who holds the session. A shell that
 * runs its own runtime and takes the session is mirrored, and none of the page's ports is built — no
 * vault opened, no sockets; otherwise the page runs its own runtime over the ports above; unsettled, it
 * boots nothing and the entry says so. `VITE_SESSION_MIRROR_DISABLED` stops it asking, unless the shell
 * says it already holds the session.
 *
 * Each host port defaults to what the shell declared (`<port>.host`, `checkout.host`), exactly as the
 * entry published them; the alternatives are what a `port.<name>` toggle may move one port to — the page
 * doing the work (`.browser`), the shell doing it only where it declared it does (`.shell`), and for
 * checkout the store or the website where the host offers them, or nothing.
 *
 * `config` keeps the shell's lane: settings the shell holds are read from the bag it injected and
 * written back over the bridge.
 */
export const webHybrid = (stores: StorageStores): WebRuntimeDeclaration =>
    defineRuntime<WebHostFacts, SessionOwnerChoice>({
        name: 'web-hybrid',
        facts: webHostFacts,
        ports: {
            storage: { default: storageResolved(stores) },
            transport: { default: transportBrowser },
            auth: { default: authLocation },
            cache: { default: cacheWebLocal(stores) },
            foreground: { default: foregroundVisibility },
        },
        host: {
            checkout: {
                default: checkoutAsDeclared,
                alternatives: [checkoutStore(storeCheckout), checkoutWeb(webCheckout), checkoutNone],
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
