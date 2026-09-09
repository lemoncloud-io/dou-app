import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { config } from '@chatic/config';
import { runtime } from '@chatic/app-runtime';

import { webConfigPorts } from './app/config/adapters';

import App from './app/app';

// Wires `@chatic/config` to this build's `import.meta.env`/injected globals — replaces
// `@chatic/web-config`'s import-time self-init with an explicit call (ADR-0079 결정 1·11). admin-v2
// never runs inside a native/desktop shell, so unlike the other three apps it does not also need
// `setStorageAdapter` — `isNative()` is always false here and sessionStorage (shared's default) is
// already correct.
config.init(webConfigPorts);

// Boot the runtime before render. The console reads the session (its admin gate asks for the relay
// profile), and the session store refuses to resolve endpoints until this call wires them —
// previously it happened as a side effect of importing the session barrel (ADR-0070 5단계 follow-up).
// No data policies: the console uses the default repository and cache assembly.
runtime.boot.initAppRuntime();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
