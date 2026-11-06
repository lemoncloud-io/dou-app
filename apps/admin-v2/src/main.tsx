import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { config } from '@chatic/config';
import { runtime } from '@chatic/app-runtime';
import { WebMedium } from '@chatic/storage';

import { webConfigPorts } from './app/config/adapters';

import App from './app/app';
import { authFailureNotice } from './app/session/authFailureNotice';

// Wires `@chatic/config` to this build's `import.meta.env`/injected globals — replaces
// `@chatic/web-config`'s import-time self-init with an explicit call.
config.init(webConfigPorts);

// admin-v2 never runs inside a native or desktop shell, so its session lives in this tab's
// sessionStorage, both ports. The app-wide `storage` already defaults to the same storage, so it is
// left as it is.
const sessionMedium = WebMedium.session();

// Boot the runtime before render. The console reads the session (its admin gate asks for the relay
// profile), and the session store refuses to resolve endpoints until this call wires them —
// previously it happened as a side effect of importing the session barrel (a follow-up to ADR-0070 step 5).
// No data policies: the console uses the default repository and cache assembly.
runtime.boot.initAppRuntime({ storage: { secret: sessionMedium, plain: sessionMedium } });

// What this console does when the server CONFIRMS the session is over (the credential was re-minted
// and the request replayed once, and it was refused again): raise a banner and leave the screen
// alone. The runtime default is `window.alert` + a hard jump to `/auth/logout`, which costs an
// admin their filters and their place mid-investigation. Registered at boot, not in the banner,
// so the policy does not depend on which screen happens to be mounted.
runtime.session.authFailureReaction.register(() => authFailureNotice.raise());

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
