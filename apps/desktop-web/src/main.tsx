import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { config } from '@chatic/config';
import { migrateLegacyPhoneCountry } from '@chatic/shared/phone';
import { runtime } from '@chatic/app-runtime';
import { createWebRuntime, readStorageEnvironment, resolveStorageStores } from '@chatic/runtime-web';

import { createWebConfigPorts } from './app/config/adapters';
import { configureAppStores } from './app/storage';
import { applyAppearance, useAppearancePrefsStore } from './app/shared/stores/useAppearancePrefsStore';

import App from './app/app';

// Every store this app keeps state in, chosen and built in one place for this environment: the
// session's secret and plain ports, the desktop shell's vault (Electron `safeStorage`) once it says so
// in what it injected, and the `device`/`tab` stores the app's own features and the runtime write
// through. Reads only what the shell injected, so it is safe this early. The late-vault mark is off:
// only apps/web writes it, after its own mobile handshake; the desktop shell always injects its list.
const stores = resolveStorageStores({
    ...readStorageEnvironment(),
    lateVaultConfirmed: false,
});
configureAppStores({ device: stores.device, tab: stores.tab, plain: stores.plain });

// Wires `@chatic/config` to this build's `import.meta.env`/injected globals — replaces
// `@chatic/web-config`'s import-time self-init with an explicit call (ADR-0079 decisions 1·11).
config.init(createWebConfigPorts(stores));

// The phone fields' last-picked country moved from its own key into the `ui.phoneCountry` setting;
// carried over once, now that the setting can be written.
migrateLegacyPhoneCountry(stores.webLocal);

// The session's secrets — its four tokens. When `resolveStorageStores` chose the vault, it is loaded —
// and anything left in localStorage moved into it — before the runtime boots. A desktop shell from
// before the vault updates itself, and keeps them in localStorage until it has.
const vault = stores.vault;
const secretStorageReady: Promise<unknown> = vault
    ? runtime.boot.prepareSecretStorage({
          vault,
          plain: stores.plain,
          web: stores.webLocal,
          tab: stores.webSession,
          afterLogout: new URLSearchParams(window.location.search).get('logout') === '1',
      })
    : Promise.resolve();

/** Everything after the secrets are loaded — the runtime boot and the first render. */
const startApp = (): void => {
    // Boot the runtime before render. This is the app's only boot call — the session store and
    // credential recovery used to wire themselves as import side effects.
    // Nothing above may read the session; nothing here touches the network.
    //
    // The cache cap rides along. Desktop stays open for days, so an unbounded chat cache grows without
    // end. 1000 per channel is twenty load-more pages of scrollback (ChatLocalDataSource reads 50,
    // useChats LOAD_MORE_SIZE is 50); evicted history comes back from the server via
    // refreshList(cursorNo).
    //
    // Set HERE and not in the shared runtime: web storage serves every non-native client, so a limit
    // living in libs/runtime-core would also truncate apps/web in a browser and apps/admin.
    // Must run before render — the runtime builds its cache storages once, on first repository access.
    runtime.boot.initAppRuntime(
        createWebRuntime({
            storage: { secret: stores.secret, plain: stores.plain, device: stores.device },
            // The cache's tab-lifetime store holds a window's invited clouds — a cache, which must hear a
            // failed write, so it gets the raw `webSession` rather than the tolerant `tab` the features use.
            cacheTab: stores.webSession,
            data: { cache: { maxChatsPerChannel: 1000 } },
        })
    );

    // Reading preferences go onto the document root before the first paint. The store hydrates from
    // the device store (localStorage) synchronously, so a reader who picked a larger size never sees
    // the default one flash.
    applyAppearance(useAppearancePrefsStore.getState());

    const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

    root.render(
        <StrictMode>
            <App />
        </StrictMode>
    );
};

// Never rejects: the vault boot answers every failure with a fallback, never with an error.
void secretStorageReady.then(startApp);
