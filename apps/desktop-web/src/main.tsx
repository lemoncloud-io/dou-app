import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { isNative } from '@chatic/bridges';
import { config } from '@chatic/config';
import { setStorageAdapter } from '@chatic/shared';
import { runtime } from '@chatic/app-runtime';

import { webConfigPorts } from './app/config/adapters';
import { migrateLegacyPushMuted } from './app/config/legacyNotificationPrefsMigration';

import App from './app/app';

// One-time carry-over of `pushMuted` out of `useNotificationPrefsStore`'s persisted blob and into
// `ui.pushMuted` (ADR-0079 "레거시 저장값 승계") — must run before `config.init()` below, whose
// `hydrateStorage()` is what actually reads the key it writes.
migrateLegacyPushMuted();

// Wires `@chatic/config` to this build's `import.meta.env`/injected globals — replaces
// `@chatic/web-config`'s import-time self-init with an explicit call (ADR-0079 결정 1·11).
config.init(webConfigPorts);

// Session/relay/cloud/identity storage backing, and the lemon transport's own storage
// (`http/transport.ts`), used to follow `usePersistentWebStorage` — exactly what `isNative()`
// already answers. Desktop-web is the one client this always resolves `true` for.
setStorageAdapter(isNative() ? localStorage : sessionStorage);

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
runtime.boot.initAppRuntime({ data: { cache: { maxChatsPerChannel: 1000 } } });

// Desktop persistent storage (localStorage) is decided by `isNative()` above (ADR-0079, replacing
// `@chatic/web-config`'s `usePersistentWebStorage`), which the lemon transport and the session
// stores share via the explicit `setStorageAdapter` call — no longer an import side effect.

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
