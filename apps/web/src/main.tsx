import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import '@lemoncloud/page-transition-core/styles.css';

import { configurePerfMetrics, logger, setupBridgeLogger } from '@chatic/bridges';
import { configureDataRuntime, setNativeCacheSupport } from '@chatic/app-runtime';

import App from './app/app';
import { appBridge, pendingNavigationStore } from './app/bridge';
import { markBoot } from './app/features/debug/metrics/bootMarks';
import { initLongTasks } from './app/features/debug/metrics/longTasks';
import { attachConsoleListener } from './app/runtime/logging/consoleListener';
import { attachLogContext, readInjectedRunId } from './app/runtime/logging/logContext';
import { startLogUploader } from './app/runtime/logging/logUploader';
import { createLogUploadSwitch } from './app/runtime/logging/logUploadSwitch';
import { schedulePageCrashReport } from './app/runtime/pageCrashReporter';
import { schedulePendingReportFlush } from './app/runtime/pendingReportFlusher';
import { attachWebCrashSentinel } from './app/runtime/webCrashSentinel';
// Concrete path, not the `app/utils` barrel: this module reads `import.meta.env`,
// which the barrel deliberately keeps out (see its comment).
import { initWebVitals } from './app/utils/webVitals';

// Wire the hub's listeners before anything else logs (principle 15). Two of the
// three live here; the storage listener is attached by `startLogUploader` below,
// which owns the queue it writes into.
setupBridgeLogger();
attachConsoleListener({ isDev: import.meta.env.DEV });

// Context must be registered before anything logs: it is stamped at dispatch,
// so an entry written earlier would carry none and be unattributable.
attachLogContext();

// Server-bound performance metrics (ADR-0071), on only inside the app WebView:
// the native shell injects the run id and the sample verdict is a pure function
// of it, so both runtimes decide alike without a bridge message. No injection —
// this bundle opened in a plain browser tab — means no run id, which means off.
// (The other shells never reach here at all: they have their own entry points
// and none of them calls this.)
//
// Ahead of the uploader below, not after it: the reporter owns the drop total,
// and the uploader's queue can evict the moment it restores a persisted batch.
// Configured later, those first evictions would go uncounted.
configurePerfMetrics({ logger, runId: readInjectedRunId() });

// Always-on log collection, wired BEFORE anything can log: the queue is filled
// by a hub subscription, so an entry dispatched before this line lands nowhere.
// Nothing above logs today and nothing below may be moved above it — that
// ordering is the guarantee now that the core no longer keeps a buffer of its
// own (see the unified-logging doc, principle 15).
//
// The build flag is read here rather than inside the switch: `import.meta` in a
// runtime module would make that module unloadable under the test transform.
startLogUploader({
    isEnabled: createLogUploadSwitch(import.meta.env.VITE_LOG_UPLOAD_DISABLED === 'true'),
    // Same flag that decides whether the console listener runs: if someone is
    // watching this build, `debug` is worth keeping; if not, nothing can read it.
    keepDebug: import.meta.env.DEV,
});

// Read the previous session's fate — a session that died without a clean
// pagehide is reported as page-crash (ADR-0047 S7). The report carries no
// buffer: the run's entries reach the collector through the batch uploader.
const webLogBoot = attachWebCrashSentinel();
schedulePageCrashReport(webLogBoot);

// Relay reports the native side detected while the web was down (WebView
// crash, RN exceptions, native crashes) through the signed web reporter.
schedulePendingReportFlush();

// Repository policies must land before the data runtime is lazily created (first render):
// the embedded `$site` of user.profile is persisted into the place cache only on the relay
// scope, so a cloud partition never receives the default place row (ADR-0045).
configureDataRuntime({
    repositories: { user: { persistEmbeddedSite: context => (context.cid ?? 'default') === 'default' } },
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
// The reply is a capability report, not an ack: this web build can be newer than the app it runs
// inside, so what the installed shell can persist locally has to be asked, not assumed. Recording it
// before render keeps the answer available by the time the data runtime creates its cache storages
// (an unrecorded answer is treated as a legacy shell, which is the safe reading — see
// nativeCacheSupport). Never rejects, so this cannot break boot in a plain browser.
void appBridge.notifyWebAppReady().then(report => {
    if (report) setNativeCacheSupport(report);
});

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
