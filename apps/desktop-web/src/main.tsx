import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { isNative } from '@chatic/bridges';
import { config } from '@chatic/config';
import { asDomStorage, setStorageAdapter, WebMedium } from '@chatic/storage';
import { runtime } from '@chatic/app-runtime';

import { webConfigPorts } from './app/config/adapters';
import { applyAppearance, useAppearancePrefsStore } from './app/shared/stores/useAppearancePrefsStore';

import App from './app/app';

// Wires `@chatic/config` to this build's `import.meta.env`/injected globals — replaces
// `@chatic/web-config`'s import-time self-init with an explicit call (ADR-0079 decisions 1·11).
config.init(webConfigPorts);

// The media this app keeps state in. Inside the desktop shell — which `isNative()` always answers
// `true` for here — localStorage, so a sign-in survives a relaunch; in a plain tab, sessionStorage.
// One medium backs both session ports and the app-wide `storage` the rest of the app writes through.
const plainMedium = isNative() ? WebMedium.local() : WebMedium.session();
setStorageAdapter(asDomStorage(plainMedium));

// Boot the runtime before render. This is the app's only boot call — the session store and
// credential recovery used to wire themselves as import side effects (ADR-0070 step-5 follow-up).
// Nothing above may read the session; nothing here touches the network.
//
// The cache cap rides along. Desktop stays open for days, so an unbounded chat cache grows without
// end. 1000 per channel is twenty load-more pages of scrollback (ChatLocalDataSource reads 50,
// useChats LOAD_MORE_SIZE is 50); evicted history comes back from the server via
// refreshList(cursorNo).
//
// Set HERE and not in the engine: web storage serves every non-native client, so a limit living in
// libs/app-runtime would also truncate apps/web in a browser and apps/admin-v2.
// Must run before render — the runtime builds its cache storages once, on first repository access.
runtime.boot.initAppRuntime({
    storage: { secret: plainMedium, plain: plainMedium },
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
