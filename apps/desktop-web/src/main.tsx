import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { BridgeStorageChannel, isNative, shellKeepsStorageMedium, webClient } from '@chatic/bridges';
import { config } from '@chatic/config';
import { migrateLegacyPhoneCountry } from '@chatic/shared/phone';
import { asDomStorage, NativeSecureMedium, setStorageAdapter, WebMedium } from '@chatic/storage';
import { runtime } from '@chatic/app-runtime';

import { webConfigPorts } from './app/config/adapters';
import { applyAppearance, useAppearancePrefsStore } from './app/shared/stores/useAppearancePrefsStore';

import App from './app/app';

// Wires `@chatic/config` to this build's `import.meta.env`/injected globals — replaces
// `@chatic/web-config`'s import-time self-init with an explicit call (ADR-0079 decisions 1·11).
config.init(webConfigPorts);

// The phone fields' last-picked country moved from its own key into the `ui.phoneCountry` setting;
// carried over once, now that the setting can be written.
migrateLegacyPhoneCountry(WebMedium.local());

// The media this app keeps state in. Inside the desktop shell — which `isNative()` always answers
// `true` for here — localStorage, so a sign-in survives a relaunch; in a plain tab, sessionStorage.
// One medium backs both session ports and the app-wide `storage` the rest of the app writes through.
const plainMedium = isNative() ? WebMedium.local() : WebMedium.session();
setStorageAdapter(asDomStorage(plainMedium));

// The session's secrets — its four tokens. The desktop shell keeps them in its vault (Electron
// `safeStorage`) once it says so in what it injected; that list is the only test, since `isNative()`
// is true for every desktop shell. The vault is loaded — and anything left in localStorage moved into
// it — before the runtime boots. A desktop shell from before the vault updates itself, and keeps them
// in localStorage until it has.
const vault = shellKeepsStorageMedium('nativeSecure')
    ? new NativeSecureMedium({
          channel: new BridgeStorageChannel(webClient, 'nativeSecure'),
          // Never localStorage: a run whose vault is unavailable keeps the session in the window only.
          fallback: WebMedium.session(),
      })
    : null;
const secretStorageReady: Promise<unknown> = vault
    ? runtime.boot.prepareSecretStorage({
          vault,
          plain: plainMedium,
          web: WebMedium.local(),
          tab: WebMedium.session(),
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
        storage: { secret: vault ?? plainMedium, plain: plainMedium },
        data: { cache: { maxChatsPerChannel: 1000 } },
    });

    // Reading preferences go onto the document root before the first paint. The store hydrates
    // localStorage synchronously, so a reader who picked a larger size never sees the default one flash.
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
