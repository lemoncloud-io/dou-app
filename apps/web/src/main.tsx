import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import '@lemoncloud/page-transition-core/styles.css';

import { isNative, logger, setupBridgeLogger, webClient } from '@chatic/bridges';
import { config } from '@chatic/config';
import { setStorageAdapter } from '@chatic/shared';
import { runtime } from '@chatic/app-runtime';

import { webConfigPorts } from './app/config/adapters';
import { migrateLegacyPreferences, syncThemeFromSharedKey } from './app/config/legacyPreferenceMigration';

import App from './app/app';
import { appBridge, pendingNavigationStore } from './app/bridge';
import { shellCapabilities } from './app/bridge/shellCapabilities';
import { markBoot } from './app/features/debug/metrics/bootMarks';
import { initLongTasks } from './app/features/debug/metrics/longTasks';
import { attachConsoleListener } from './app/runtime/logging/consoleListener';
import { attachLogContext, readInjectedRunId, reportRunIdJoin } from './app/runtime/logging/logContext';
import { startLogUploader } from './app/runtime/logging/logUploader';
import { createLogUploadSwitch } from './app/runtime/logging/logUploadSwitch';
import { schedulePageCrashReport } from './app/runtime/pageCrashReporter';
import { schedulePendingReportFlush } from './app/runtime/pendingReportFlusher';
import { configureWebPerfTraces, observeBridgeRequests, observeSocketRequests } from './app/runtime/perf';
import { attachWebCrashSentinel } from './app/runtime/webCrashSentinel';
import { bootSplash } from './app/runtime/bootSplash';
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

// First entry of the run, and it has to be after the line above: it reports whether this launch's
// native and web halves share a runId, and an entry dispatched before the queue subscribes would be
// published to nobody. Silent when the join is intact (a plain browser always is).
reportRunIdJoin();

// One-time carry-over of usePreferenceStore's pre-@chatic/config localStorage keys (ADR-0079
// "migrating legacy stored values") — must run before `config.init()` below, whose `hydrateStorage()` is what
// actually reads the keys these write. `syncThemeFromSharedKey` is not one-time: `vite-ui-theme` stays
// the durable, cross-app key (five apps' pre-paint scripts and `@chatic/theme`'s `ThemeProvider` all
// read/write it directly), re-synced into `ui.theme`'s own storage on every boot.
migrateLegacyPreferences();
syncThemeFromSharedKey();

// Wires `@chatic/config` to this build's `import.meta.env`/injected globals — an explicit call
// instead of `@chatic/web-config`'s former import-time side effect (ADR-0079 decisions 1·11). Everything
// downstream that reads a setting (`app-runtime`'s HTTP/session code, later this file's own runtime
// boot) resolves it lazily, well after this line, so placement here — before `initAppRuntime` and
// well before anything renders — is early enough with room to spare.
config.init(webConfigPorts);

// Session/relay/cloud/identity storage backing — an explicit call replacing the other half of
// `@chatic/web-config`'s old side effect. `isNative()` is exactly "hosted inside a native or desktop
// shell" (it checks the same window handles `usePersistentWebStorage` used to), so no separate
// detector is needed: inside a shell, use localStorage so the session survives a WebView cache wipe;
// in a plain browser tab, sessionStorage.
setStorageAdapter(isNative() ? localStorage : sessionStorage);

// Boot the runtime. Placed HERE by contract, between two boundaries:
//   - AFTER the log wiring above, because this call can log (duplicate boot, late data policy).
//   - BEFORE anything below that can read the session. Nothing currently does before render, and
//     the relay store throws rather than guessing when its resolvers are missing, so a future line
//     that moves above this one fails loudly instead of signing requests against an empty host.
// This replaces the import side effects that used to boot the session store and credential recovery
// (ADR-0070 step-5 follow-up); it touches no network.
//
// Repository policy rides along: the embedded `$site` of user.profile is persisted into the place
// cache only on the relay scope, so a cloud partition never receives the default place row
// (ADR-0094). It must land before the data runtime is lazily created on first repository access.
runtime.boot.initAppRuntime({
    data: {
        repositories: { user: { persistEmbeddedSite: context => (context.cid ?? 'default') === 'default' } },
    },
});

// Read the previous session's fate — a session that died without a clean
// pagehide is logged as page-crash (ADR-0097 S7). It carries no buffer: the dead
// run's entries reach the collector through the batch uploader on their own.
// Must stay after `startLogUploader`, which owns the only log store.
const webLogBoot = attachWebCrashSentinel();
schedulePageCrashReport(webLogBoot);

// Drain the reports the native side detected while the web was down (WebView
// crash, RN exceptions, native crashes) into the log pipeline.
schedulePendingReportFlush();

// Boot/perf collectors first so buffered long tasks and the boot timeline
// include everything from here on (surfaced in the debug overlay).
markBoot('main-start');

// The boot cover in index.html lifts when the first screen paints (runtime/bootSplash). The cap is
// the guarantee that a boot which never gets there still shows whatever it did render — an error,
// a stalled gate — instead of an endless blank cover. Generous on purpose: it is not a budget, and
// the native shell lifts its own splash on a shorter cap of its own.
bootSplash.armCap(10_000);
initLongTasks();

// Performance traces. Where they go is only known once the WebAppReady reply
// says whether the installed app records Firebase traces, so until then they
// are held and replayed (see runtime/perf). An app build without the handlers
// gets the log pipeline instead, sampled by the injected run id; a plain browser
// tab has no run id and records nothing. (The other shells never reach here:
// they have their own entry points and none of them calls this.)
//
// Only ordering that matters: this precedes `initWebVitals` below, whose
// FCP/LCP are recorded through it.
const webPerfTraces = configureWebPerfTraces({ logger, runId: readInjectedRunId() });

// Times every bridge request of a sampled run, from here on so the boot burst — the WebAppReady
// handshake included — is in it. Samples are held with the other traces until the report says
// where they go, and only a few of them, so they cannot crowd the boot traces out of that hold.
observeBridgeRequests({ client: webClient, runId: readInjectedRunId(), isHeld: webPerfTraces.isHeld });

// Times every socket request of a sampled run (a different tenth of runs from the bridge's), per
// request type, so the server's answer time can be read apart from what the screens add to it.
observeSocketRequests({
    manager: runtime.connection.getSocketManager(),
    runId: readInjectedRunId(),
    isHeld: webPerfTraces.isHeld,
});

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
    // First, so nothing that follows can leave every trace of this session held unresolved.
    webPerfTraces.resolveWith(report);
    // Until this lands the viewer shows no save or share — the safe reading for an older app.
    shellCapabilities.setReport(report);
    if (report) runtime.boot.setNativeCacheSupport(report);
});

// Force the native debug menu off on every web start — the OTA-controllable kill switch for the
// native floating debug button (FAB), which is gated on the native `debugModeEnabled` flag. Sent
// right after WebAppReady so it rides the same buffered flush to a native side that is guaranteed to
// be listening (a mount-time post can race ahead of the native router and be dropped). Entering the
// debug menu is a per-session action afterwards (MyPage 10-tap → SetDebugMode(true)).
// NOTE: there is no stage that escapes this. The old note here claimed non-PROD builds showed the
// FAB through a compile-time flag the web could not change; that was never true (`__DEV__` gated the
// console and log sinks, never the panel), and ADR-0080 decision 12 has since deleted the native FAB and
// every other debug UI from the app. This call is now belt-and-braces: it clears a flag that older
// installed builds still read.
appBridge.setDebugMode(false);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
