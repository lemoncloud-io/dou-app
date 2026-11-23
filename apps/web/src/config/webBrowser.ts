import {
    authLocation,
    defineRuntime,
    engineCore,
    foregroundVisibility,
    transportBrowser,
    webHostFacts,
} from '@chatic/runtime-web';
import type { SessionOwnerChoice, StorageStores, WebHostFacts } from '@chatic/runtime-web';

import { cacheWebLocal } from './adapters/cache';
import { appShellHost } from './adapters/appShell';
import { checkoutAsDeclared } from './adapters/checkout';
import { diagnosticsHost } from './adapters/diagnostics';
import { filesHost } from './adapters/files';
import { linksHost } from './adapters/links';
import { mediaHost } from './adapters/media';
import { pushHost } from './adapters/push';
import { signInHost } from './adapters/signIn';
import { storageResolved } from './adapters/storage';
import { createWebConfigPorts } from './configPorts';
import { webRuntimePolicies, type WebRuntimeDeclaration } from './policies';

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
