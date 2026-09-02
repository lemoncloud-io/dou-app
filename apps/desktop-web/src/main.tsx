import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { initAppRuntime } from '@chatic/app-runtime';

import App from './app/app';

// Boot the runtime before render. This is the app's only boot call — the session store and
// credential recovery used to wire themselves as import side effects (ADR-0070 5단계 follow-up).
// Nothing above may read the session; nothing here touches the network.
//
// The cache cap rides along. Desktop stays open for days, so an unbounded chat cache grows without
// end. 1000 per channel is twenty load-more pages of scrollback (ChatLocalDataSourceV2 reads 50,
// useChats LOAD_MORE_SIZE is 50); evicted history comes back from the server via
// refreshList(cursorNo).
//
// Set HERE and not in the engine: web storage serves every non-native client, so a limit living in
// libs/app-runtime would also truncate apps/web in a browser and apps/admin-v2.
// Must run before render — the runtime builds its cache storages once, on first repository access.
initAppRuntime({ data: { cache: { maxChatsPerChannel: 1000 } } });

// Desktop persistent storage (localStorage) is decided by `@chatic/web-config`'s
// `usePersistentWebStorage`, which the lemon transport and the session stores share. This file no
// longer overrides the adapter — doing so here ran AFTER the transport was already constructed.

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
