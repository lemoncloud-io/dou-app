import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { runtime } from '@chatic/runtime';
import { logger } from '@chatic/bridges';
import { startRuntime } from '@chatic/runtime-web';

import { admin } from './config/admin';

import App from './app/app';
import { authFailureNotice } from './app/session/authFailureNotice';

try {
    await startRuntime(admin);
} catch (error) {
    logger.error('app.runtime_start_failed', '[admin] the runtime did not start; the console is not rendered', {
        error,
    });
    throw error;
}

runtime.session.authFailureReaction.register(() => authFailureNotice.raise());

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
