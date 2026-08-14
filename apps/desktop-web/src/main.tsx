import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { configureDataRuntime } from '@chatic/app-runtime';

import App from './app/app';

// Desktop stays open for days, so an unbounded chat cache grows without end. 1000 per channel is
// twenty load-more pages of scrollback (ChatLocalDataSourceV2 reads 50, useChats LOAD_MORE_SIZE is
// 50); evicted history comes back from the server via refreshList(cursorNo).
//
// Set HERE and not in the engine: web storage serves every non-native client, so a limit living in
// libs/app-runtime would also truncate apps/web in a browser and apps/admin-v2.
// Must run before render — the runtime builds its cache storages once, on first repository access.
configureDataRuntime({ cache: { maxChatsPerChannel: 1000 } });

// Desktop persistent storage (localStorage) is configured centrally in
// libs/web-core/src/core/index.ts via usePersistentStorage, which the webCore
// factory, coreStorage adapter, and logout-clear all share. This file no longer
// overrides the adapter — doing so here ran AFTER webCore was already constructed.

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
