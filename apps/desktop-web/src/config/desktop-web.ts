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

/**
 * The desktop page's runtime, declared: one adapter per port and no alternatives, so every port is
 * fixed to what desktop-web has always run. A `port.*` toggle in config — say a local override left in
 * this window — names no adapter this declaration allows, and the port stays on its default, with the
 * reason logged.
 *
 * `config` hands `@chatic/config` its ports over this window's stores, and `startRuntime` initialises
 * config with them before it reads a toggle — synchronously, at the point the entry's own `config.init`
 * used to run. The host ports are published next, before the vault loads and the runtime boots, which is
 * the order the entry kept by hand.
 */
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
        // The desktop app sells nothing: no screen of it offers a subscription.
        checkout: { default: checkoutNone },
        // No screen of the desktop app attaches through a shell picker: its inputs are the browser's own.
        media: { default: mediaBrowser },
        // Its files move through the browser's requests; no desktop screen hands a transfer to the shell.
        files: { default: filesBrowser },
        // The rest read what the desktop shell declared: its window has a bridge, so a shell that declares
        // none of these keys gets `shell` for each; a browser tab gets `browser`.
        links: { default: linksHost },
        appShell: { default: appShellHost },
        signIn: { default: signInHost },
        diagnostics: { default: diagnosticsHost },
        push: { default: pushHost },
    },
    constraints: [],
    // Desktop stays open for days, so an unbounded chat cache grows without end. 1000 per channel is
    // twenty load-more pages of scrollback (ChatLocalDataSource reads 50, useChats LOAD_MORE_SIZE is
    // 50); evicted history comes back from the server via refreshList(cursorNo). Set here and not in the
    // shared runtime: web storage serves every non-native client, so a limit living in
    // libs/runtime-core would also truncate apps/web in a browser and apps/admin.
    data: { cache: { maxChatsPerChannel: 1000 } },
    config: createWebConfigPorts(desktopStores),
});
