import {
    authLocation,
    checkoutNone,
    defineRuntime,
    foregroundVisibility,
    transportBrowser,
    webHostFacts,
} from '@chatic/runtime-web';

import { cacheDesktopWebStorage, createWebConfigPorts, desktopStores, storageDesktop } from './adapters';
import { appShellHost } from './adapters/appShell';
import { diagnosticsHost } from './adapters/diagnostics';
import { filesBrowser } from './adapters/files';
import { linksHost } from './adapters/links';
import { mediaBrowser } from './adapters/media';
import { pushHost } from './adapters/push';
import { signInHost } from './adapters/signIn';

export const desktopWeb = defineRuntime({
    name: 'desktop-web',
    facts: webHostFacts,
    ports: {
        storage: { default: storageDesktop },
        transport: { default: transportBrowser },
        auth: { default: authLocation },
        cache: { default: cacheDesktopWebStorage },
        foreground: { default: foregroundVisibility },
    },
    host: {
        checkout: { default: checkoutNone },
        media: { default: mediaBrowser },
        files: { default: filesBrowser },
        links: { default: linksHost },
        appShell: { default: appShellHost },
        signIn: { default: signInHost },
        diagnostics: { default: diagnosticsHost },
        push: { default: pushHost },
    },
    constraints: [],
    data: { cache: { maxChatsPerChannel: 1000 } },
    config: createWebConfigPorts(desktopStores),
});
