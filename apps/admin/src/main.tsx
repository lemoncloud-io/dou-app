import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { startRuntime } from '@chatic/runtime-web';

import { admin } from './config/admin';

import App from './app/app';
import { authFailureNotice } from './app/session/authFailureNotice';

// Start the runtime the console declares (`config/admin.ts`) before render. The start initialises
// `@chatic/config` from the declaration's ports first — synchronously, at the point the explicit
// `config.init` used to run — then settles and builds each port and boots the runtime. The console
// reads the session (its admin gate asks for the relay profile), and the session store refuses to
// resolve endpoints until the runtime is booted.
//
// A failed start is logged under its own tag and thrown on, so it stays the uncaught error a
// synchronous boot failure always was, and the console does not render on a runtime that never came up.
try {
    await startRuntime(admin);
} catch (error) {
    logger.error('app.runtime_start_failed', '[admin] the runtime did not start; the console is not rendered', {
        error,
    });
    throw error;
}

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
