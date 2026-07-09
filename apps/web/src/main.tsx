import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import '@lemoncloud/page-transition-core/styles.css';

import { setupBridgeLogger } from '@chatic/bridges';

import App from './app/app';
import { appBridge, pendingNavigationStore } from './app/bridge';
import { markBoot } from './app/features/debug/metrics/bootMarks';
import { initLongTasks } from './app/features/debug/metrics/longTasks';
import { initWebVitals } from './app/utils';

// Wire log sinks before anything else logs: native WebView forwards to the
// app (mirrored to the console in dev builds), plain web logs to the console.
setupBridgeLogger({ consoleInNative: import.meta.env.DEV });

// Boot/perf collectors first so buffered long tasks and the boot timeline
// include everything from here on (surfaced in the debug overlay).
markBoot('main-start');
initLongTasks();

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
