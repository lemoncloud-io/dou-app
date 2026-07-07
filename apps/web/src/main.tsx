import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import '@lemoncloud/page-transition-core/styles.css';

import App from './app/app';
import { appBridge, pendingNavigationStore } from './app/bridge';
import { initWebVitals } from './app/utils';

// Initialize Web Vitals monitoring
initWebVitals();

// Capture native OnNavigate events before render: the native bridge buffers the
// cold-start push tap until the web signals readiness, and the router (with its
// navigation handler) mounts much later. Subscribing here guarantees the flushed
// event is held instead of dropped. See pendingNavigationStore.
pendingNavigationStore.start();

// Complete the bridge handshake only AFTER the capture is armed: the native side
// flushes its buffered events (cold-start OnNavigate included) on WebAppReady, so
// this ordering is what makes the flush safe. Log relays (SendLog) deliberately do
// not count as readiness on the native side — this call is the real signal.
appBridge.notifyWebAppReady();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
