import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import '@lemoncloud/page-transition-core/styles.css';

import { setupBridgeLogger } from '@chatic/bridges';
import { configureDataRuntime } from '@chatic/app-runtime';

import App from './app/app';
import { appBridge, pendingNavigationStore } from './app/bridge';
import { markBoot } from './app/features/debug/metrics/bootMarks';
import { initLongTasks } from './app/features/debug/metrics/longTasks';
import { initWebVitals } from './app/utils';

// Wire log sinks before anything else logs: native WebView forwards to the
// app (mirrored to the console in dev builds), plain web logs to the console.
setupBridgeLogger({ consoleInNative: import.meta.env.DEV });

// Repository policies must land before the data runtime is lazily created (first render):
// the embedded `$site` of user.profile is persisted into the place cache only on the relay
// scope, so a cloud partition never receives the default place row (ADR-0045).
configureDataRuntime({
    user: { persistEmbeddedSite: context => (context.cid ?? 'default') === 'default' },
});

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

// Force the native debug menu off on every web start — the OTA-controllable kill switch for the
// native floating debug button (FAB), which is gated on the native `debugModeEnabled` flag. Sent
// right after WebAppReady so it rides the same buffered flush to a native side that is guaranteed to
// be listening (a mount-time post can race ahead of the native router and be dropped). Entering the
// debug menu is a per-session action afterwards (MyPage 10-tap → SetDebugMode(true)).
// NOTE: this only hides the FAB on PROD builds, where the native gate is `debugModeEnabled` alone.
// Non-PROD builds also show it via a compile-time flag the web cannot change — that needs a native build.
appBridge.setDebugMode(false);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
