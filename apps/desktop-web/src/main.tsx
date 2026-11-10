import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { config } from '@chatic/config';
import { migrateLegacyPhoneCountry } from '@chatic/shared/phone';
import { asDomStorage, setStorageAdapter } from '@chatic/storage';
import { runtime } from '@chatic/app-runtime';

import { createWebConfigPorts } from './app/config/adapters';
import { configureAppMedia } from './app/storage';
import { applyAppearance, useAppearancePrefsStore } from './app/shared/stores/useAppearancePrefsStore';

import App from './app/app';

// Every medium this app keeps state in, chosen and built in one place for this environment: the
// session's secret and plain ports, the desktop shell's vault (Electron `safeStorage`) once it says so
// in what it injected, and the `device`/`tab` media the app's own features and the runtime write
// through. Reads only what the shell injected, so it is safe this early. The late-vault mark is off:
// only apps/web writes it, after its own mobile handshake; the desktop shell always injects its list.
const media = runtime.boot.resolveStorageMedia({ ...runtime.boot.readStorageEnvironment(), lateVaultConfirmed: false });
configureAppMedia({ device: media.device, tab: media.tab });

// Wires `@chatic/config` to this build's `import.meta.env`/injected globals — replaces
// `@chatic/web-config`'s import-time self-init with an explicit call (ADR-0079 decisions 1·11).
config.init(createWebConfigPorts(media));

// The phone fields' last-picked country moved from its own key into the `ui.phoneCountry` setting;
// carried over once, now that the setting can be written.
migrateLegacyPhoneCountry(media.webLocal);

// The app-wide `storage` the rest of the app writes through is the session's plain medium.
setStorageAdapter(asDomStorage(media.plain));

// The session's secrets — its four tokens. When `resolveStorageMedia` chose the vault, it is loaded —
// and anything left in localStorage moved into it — before the runtime boots. A desktop shell from
// before the vault updates itself, and keeps them in localStorage until it has.
const vault = media.vault;
const secretStorageReady: Promise<unknown> = vault
    ? runtime.boot.prepareSecretStorage({
          vault,
          plain: media.plain,
          web: media.webLocal,
          tab: media.webSession,
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
    // Set HERE and not in the engine: web storage serves every non-native client, so a limit living in
    // libs/app-runtime would also truncate apps/web in a browser and apps/admin.
    // Must run before render — the runtime builds its cache storages once, on first repository access.
    runtime.boot.initAppRuntime({
        // The runtime's `tab` medium holds a cache (a window's invited clouds), which must hear a failed
        // write, so it gets the raw `webSession` rather than the tolerant `tab` the features use.
        storage: { secret: media.secret, plain: media.plain, device: media.device, tab: media.webSession },
        data: { cache: { maxChatsPerChannel: 1000 } },
    });

    // Reading preferences go onto the document root before the first paint. The store hydrates from
    // the device medium (localStorage) synchronously, so a reader who picked a larger size never sees
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
