import {
    appShellHost,
    authLocation,
    defineRuntime,
    diagnosticsHost,
    engineCore,
    filesHost,
    foregroundVisibility,
    linksHost,
    mediaHost,
    pushHost,
    signInHost,
    transportBrowser,
    webHostFacts,
} from '@chatic/runtime-web';
import type { SessionOwnerChoice, StorageStores, WebHostFacts } from '@chatic/runtime-web';

import { cacheWebLocal } from './adapters/cache';
import { checkoutAsDeclared } from './adapters/checkout';
import { storageResolved } from './adapters/storage';
import { createWebConfigPorts } from './configPorts';
import { webRuntimePolicies, type WebRuntimeDeclaration } from './policies';

/**
 * `web-browser` — apps/web in a plain browser tab, where nothing but the page can hold the session.
 *
 * Every port is fixed to what the entry built before declarations: the session on the stores the entry
 * resolved (the tab's `sessionStorage`), the page's own network, address and visibility, and the
 * page's cache routing over the same tab store. The engine is the core over those ports: a tab has no
 * shell to offer its runtime, so there is nothing to settle and nothing to mirror.
 *
 * The host ports answer what a browser can do (`<port>.host` reads the host profile, which has no bridge
 * here), and have no alternatives: a `.shell` adapter is never supported without a shell, and `.browser`
 * is already the answer. Checkout hands over to the website, the old rule for a host without a bridge.
 *
 * `config` has no shell lane: a plain tab has no shell to round-trip a write to.
 */
export const webBrowser = (stores: StorageStores): WebRuntimeDeclaration =>
    defineRuntime<WebHostFacts, SessionOwnerChoice>({
        name: 'web-browser',
        facts: webHostFacts,
        ports: {
            storage: { default: storageResolved(stores) },
            transport: { default: transportBrowser },
            auth: { default: authLocation },
            cache: { default: cacheWebLocal(stores) },
            foreground: { default: foregroundVisibility },
        },
        host: {
            checkout: { default: checkoutAsDeclared },
            media: { default: mediaHost },
            files: { default: filesHost },
            links: { default: linksHost },
            appShell: { default: appShellHost },
            signIn: { default: signInHost },
            diagnostics: { default: diagnosticsHost },
            push: { default: pushHost },
        },
        engine: { default: engineCore },
        constraints: [],
        config: createWebConfigPorts(stores),
        ...webRuntimePolicies,
    });
