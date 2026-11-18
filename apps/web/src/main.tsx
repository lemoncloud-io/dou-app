import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import '@lemoncloud/page-transition-core/styles.css';
// After the package's stylesheet on purpose: it replaces the package's Android animation with the
// same selectors, so the import order is what makes it win.
import './pageTransitions.css';

import { logger, setupBridgeLogger, webClient } from '@chatic/bridges';
import { migrateLegacyPhoneCountry } from '@chatic/shared/phone';
import { runtime } from '@chatic/runtime';
import { LATE_VAULT_MARK, resolveStorageStores, setNativeCacheSupport, startRuntime } from '@chatic/runtime-web';
import type { SessionOwnerChoice } from '@chatic/runtime-web';

import { declareWebRuntime } from './config/webRuntime';
import { syncThemeFromSharedKey } from './app/config/themeSharedKeySync';

import App from './app/app';
import { configureAppStores } from './app/storage';
import { appBridge, pendingNavigationStore } from './app/bridge';
import { shellCapabilities } from './app/bridge/shellCapabilities';
import { clearComposerDrafts } from './app/features/channels/stores/useComposerDraftStore';
import { clearInputLocks } from './app/features/channels/stores/useInputLockStore';
import { clearNotifications } from './app/stores/useNotificationStore';
import { markBoot } from './app/features/debug/metrics/bootMarks';
import { initLongTasks } from './app/features/debug/metrics/longTasks';
import { attachConsoleListener } from './app/runtime/logging/consoleListener';
import { attachLogContext, readInjectedRunId, readLogContext, reportRunIdJoin } from './app/runtime/logging/logContext';
import { startLogUploader } from './app/runtime/logging/logUploader';
import { createLogUploadSwitch } from './app/runtime/logging/logUploadSwitch';
import { schedulePageCrashReport } from './app/runtime/pageCrashReporter';
import { schedulePendingReportFlush } from './app/runtime/pendingReportFlusher';
import {
    configureWebPerfTraces,
    observeBridgeRequests,
    observeSocketRequests,
    observeStateOutbox,
} from './app/runtime/perf';
import { onUsageSessionStart, startAppIconUsage, startTelemetry } from './app/runtime/telemetry';
import { attachWebCrashSentinel } from './app/runtime/webCrashSentinel';
import { bootSplash } from './app/runtime/bootSplash';
import { setLaunchSessionOwner } from './app/runtime/launchSessionOwner';
import { sendSessionOwnerDefault, sendSessionOwnerDefaultUnasked } from './app/runtime/sessionOwnerDefault';
import { showSessionOwnerUnsettled } from './app/runtime/sessionOwnerUnsettled';
import { dropSignedOutKeys } from './app/runtime/signedOutKeys';
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

// Every store this app keeps state in, chosen and built in one place for this environment: the
// session's secret and plain ports, the device vault when the shell keeps one, and the `device`/`tab`
// stores the app's own features and the runtime write through. Reads only what the shell injected and
// the tab's own mark, so it is safe this early; the features take their stores from here on.
const stores = resolveStorageStores();
configureAppStores({ device: stores.device, tab: stores.tab });

// `vite-ui-theme` is the durable, cross-app theme key (five apps' pre-paint scripts and
// `@chatic/theme`'s `ThemeProvider` all read/write it directly); re-synced into `ui.theme`'s own
// storage on every boot. Must run before config is initialised (the first thing `startRuntime` below
// does), whose `hydrateStorage()` is what actually reads the key it writes.
syncThemeFromSharedKey(stores.webLocal);

// Read before anything can sign in: whether localStorage held the session's tokens when this page
// started. Only a run without a vault writes them there, and `adoptLateVault` needs to tell those
// apart from a copy an older app left behind. Nothing between here and the boot writes them.
const vault = stores.vault;
const webSessionCopyAtBoot = !vault && runtime.boot.hasWebSessionCopy(stores.webLocal);

// The runtime this page runs, declared in `src/config/`: `web-hybrid` inside a shell (the host profile
// found a bridge — the phone app's WebView or the virtual shell), `web-browser` in a plain tab. Both
// are built over the stores resolved above, so the session, config's session lane and the cache's tab
// rows stay one store where site data is blocked.
//
// `startRuntime` runs, in this order:
//   1. `config.init` with the declaration's ports — synchronously, at this line: before any lazy setting
//      read, and early enough with room to spare for everything downstream that reads one.
//   2. the host's ports, chosen once and published before anything that renders could read one.
//   3. the engine. Inside a shell it first settles who holds the session this launch — a shell that runs
//      its own runtime offers it before the page runs (`CHATIC_APP_RUNTIME`); on a `native` answer the
//      page mirrors that runtime and builds none of its own ports: no secret store, no sockets, no
//      cache. Without an offer (a browser, any shell that does not run its runtime) the page owns it at
//      once, without a word to the shell. On a launch the page owns, the device vault — where the shell
//      keeps one — is loaded, and anything left in localStorage moved into it, before the runtime boots,
//      so every read after that is synchronous.
//   4. `initAppRuntime` with that engine. Placed here by contract, between two boundaries: AFTER the log
//      wiring above, because the boot can log (duplicate boot, late data policy); BEFORE anything below
//      that can read the session. Nothing currently does before render, and the relay store throws
//      rather than guessing when its resolvers are missing, so a future line that moves above this one
//      fails loudly instead of signing requests against an empty host. It touches no network.
// Each port's choice is logged (`app.runtime_port`), with the `port.*` toggle that changed it, if any.
const started = startRuntime(declareWebRuntime(stores));

/**
 * A shell that keeps a vault without having said so before the page ran — it lists `StorageGet` in
 * its handshake, but `CHATIC_APP_STORAGE_MEDIA` did not land. Moving the session into the vault in the
 * middle of a run would race token writes and skip the boot's own sign-in decision, so the tab is
 * marked and reloaded once, and the next boot takes the vault from the start.
 */
const adoptLateVault = (): void => {
    // Tokens this run wrote to localStorage before it knew about the vault (a guest sign-in on a session
    // already moved there) would replace the vault's session at the next boot, so they go. A copy that
    // was there at boot is a session no page has moved yet, and stays for that boot to move.
    if (!webSessionCopyAtBoot) runtime.boot.discardWebSessionCopy(stores.webLocal);
    stores.webSession.set(LATE_VAULT_MARK, '1');
    window.location.reload();
};

/** The two settings `sendSessionOwnerDefault` reads, named here so the bundle keeps only these. */
const sessionOwnerDefaultEnv = {
    VITE_APP_SESSION_OWNER: import.meta.env.VITE_APP_SESSION_OWNER,
    VITE_SESSION_MIRROR_DISABLED: import.meta.env.VITE_SESSION_MIRROR_DISABLED,
};

/** Everything after the runtime has booted — the page's own sign-out duties, the collectors and the first render. */
const startApp = (owner: Exclude<SessionOwnerChoice, { sessionOwner: null }>): void => {
    // On a launch the shell owns, its runtime cannot reach the page's storage, so the page takes its
    // own signed-out keys: at each sign-out, and at the boot that follows one (`?logout=1` — the shell
    // restarts the page there when its session ends), as the page's runtime does on its own launches.
    //
    // The session's tokens in localStorage go too. On such a launch they can only be a copy from an app
    // without a vault that no page has moved yet, and the next launch the page owns lets that copy
    // replace whatever the vault then holds, which would sign the person back in to the account they
    // just left.
    if (owner.sessionOwner === 'native') {
        const dropSignedOut = () => {
            dropSignedOutKeys(stores.plain);
            runtime.boot.discardWebSessionCopy(stores.webLocal);
        };
        runtime.session.registerSessionLogoutCallback(dropSignedOut);
        if (new URLSearchParams(window.location.search).get('logout') === '1') dropSignedOut();
    }

    // A composer draft is the signed-in person's own unsent text and files: they go at sign-out, so the
    // next account on this device never opens a room onto them.
    runtime.session.registerSessionLogoutCallback(clearComposerDrafts);
    // The same for the rooms whose composer was locked: they are the signed-in person's rooms.
    runtime.session.registerSessionLogoutCallback(clearInputLocks);
    // And the notification inbox: what was captured for the signed-in person, from their rooms.
    runtime.session.registerSessionLogoutCallback(clearNotifications);

    // Read the previous session's fate — a session that died without a clean
    // pagehide is logged as page-crash. It carries no buffer: the dead
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
    // Statistics (performance traces, usage events) go through the same pipeline as logs, decided by
    // a sampling policy read here, once, for the whole run. Before the vitals and the first traces, so
    // they are recorded under it; with the default policy nothing is recorded at all. The development
    // override lets a policy be tried before the server serves one; a production build ignores it.
    startTelemetry({
        context: readLogContext,
        allowPolicyOverride: import.meta.env.DEV,
        onReject: import.meta.env.DEV ? rejection => console.warn('[telemetry] refused', rejection) : undefined,
    });

    const webPerfTraces = configureWebPerfTraces();

    // Times every bridge request of a sampled run, from here on so the boot burst — the WebAppReady
    // handshake included — is in it. Samples are held with the other traces until the report says
    // where they go, and only a few of them, so they cannot crowd the boot traces out of that hold.
    observeBridgeRequests({ client: webClient, runId: readInjectedRunId(), isHeld: webPerfTraces.isHeld });

    // Times every socket request of a sampled run (a different tenth of runs from the bridge's), per
    // request type, so the server's answer time can be read apart from what the screens add to it.
    observeSocketRequests({
        observe: runtime.connection.observeSocketRequests,
        runId: readInjectedRunId(),
        isHeld: webPerfTraces.isHeld,
    });

    // Times how each state write (read cursor, notification setting, room name) reaches the server after
    // the screen has already shown it — the local-first writes' only remaining wait. Its own runs again.
    observeStateOutbox({
        setObserver: runtime.data.setStateOutboxObserver,
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
    // (an unrecorded answer falls back to the fixed set of cache types every supported shell stores — see
    // nativeCacheSupport). Never rejects, so this cannot break boot in a plain browser.
    void appBridge.notifyWebAppReady().then(report => {
        // First, so nothing that follows can leave every trace of this session held unresolved.
        webPerfTraces.resolveWith(report);
        // Until this lands the viewer shows no save or share: it does not yet know what this shell handles.
        shellCapabilities.setReport(report);
        if (report) setNativeCacheSupport(report);
        // A shell that keeps a vault but did not say so before the page ran is found here instead,
        // and the session moves into its vault for the rest of the run.
        // Only on a launch the page owns: on one the shell owns, the vault is the shell's.
        if (owner.sessionOwner === 'web' && !vault && report?.supportedWebMessages?.includes('StorageGet')) {
            void adoptLateVault();
        }
        // The owner this web build names for installs nobody switched, recorded by the app for its next
        // start. On every boot, so a web deploy is what moves production installs onto the app's runtime
        // and back; the owner of this launch is already settled and does not change.
        void sendSessionOwnerDefault(report, appBridge, sessionOwnerDefaultEnv);
        // Which icon this install has, for the usage statistics. After the handshake, because a request
        // posted before it can reach the app ahead of its router; and only where the app says it answers,
        // which leaves out the desktop app and every phone build too old to switch icons.
        if (report?.supportedWebMessages?.includes('FetchAppIcon')) {
            startAppIconUsage({
                fetchIcon: () =>
                    webClient
                        .request({ type: 'FetchAppIcon', data: {} })
                        .then(res => (res.success ? res.data : undefined)),
                onSessionStart: onUsageSessionStart,
            });
        }
    });

    // Force the native debug menu off on every web start — the OTA-controllable kill switch for the
    // native floating debug button (FAB), which is gated on the native `debugModeEnabled` flag. Sent
    // right after WebAppReady so it rides the same buffered flush to a native side that is guaranteed to
    // be listening (a mount-time post can race ahead of the native router and be dropped). Entering the
    // debug menu is a per-session action afterwards (MyPage 10-tap → SetDebugMode(true)).
    // NOTE: there is no stage that escapes this. The old note here claimed non-PROD builds showed the
    // FAB through a compile-time flag the web could not change; that was never true (`__DEV__` gated the
    // console and log sinks, never the panel), and a later decision deleted the native FAB and
    // every other debug UI from the app. This call is now belt-and-braces: it clears a flag that older
    // installed builds still read.
    appBridge.setDebugMode(false);

    const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

    root.render(
        <StrictMode>
            <App />
        </StrictMode>
    );
};

// The start never rejects on its own account: the owner is settled or given up on, and the vault boot
// answers every failure with a fallback. A launch whose owner could not be settled boots neither
// runtime — the shell may hold the session, and a page that ran its own then would be a second owner —
// and says so, with a reload. A browser tab's engine settles nothing: the page holds the session.
//
// What does fail — a declaration that cannot resolve, a port that throws while it is built — is logged
// under its own tag and thrown on, so it stays the uncaught error a failed boot always was, and nothing
// renders on a runtime that never came up.
void started.then(
    ({ owner = { sessionOwner: 'web' } }) => {
        // The phone fields' last-picked country moved from its own key into the `ui.phoneCountry` setting;
        // carried over once, now that the setting can be written. Before the first render, the only
        // reader.
        migrateLegacyPhoneCountry(stores.webLocal);
        // Inside a shell this was recorded the moment the owner was settled, before the boot logged
        // anything (`config/adapters/engine.ts`); here it is the same value again, and a browser tab's.
        setLaunchSessionOwner(owner.sessionOwner ?? undefined);
        if (owner.sessionOwner === null) {
            showSessionOwnerUnsettled(owner);
            void sendSessionOwnerDefaultUnasked(appBridge, sessionOwnerDefaultEnv);
        } else startApp(owner);
    },
    (error: unknown) => {
        logger.error('app.runtime_start_failed', '[web] the runtime did not start; the app is not rendered', {
            error,
        });
        throw error;
    }
);
