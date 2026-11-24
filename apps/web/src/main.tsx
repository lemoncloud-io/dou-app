import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import '@lemoncloud/page-transition-core/styles.css';
import './pageTransitions.css';

import { logger, setupBridgeLogger, webClient } from '@chatic/bridges';
import { migrateLegacyPhoneCountry } from '@chatic/shared/phone';
import { runtime } from '@chatic/runtime';
import {
    LATE_VAULT_MARK,
    readWebHostFacts,
    resolveStorageStores,
    setNativeCacheSupport,
    startRuntime,
} from '@chatic/runtime-web';
import type { SessionOwnerChoice } from '@chatic/runtime-web';

import { checkoutOptionsOf } from './config/checkoutOptions';
import { declareWebRuntime } from './config/webRuntime';
import { syncThemeFromSharedKey } from './app/config/themeSharedKeySync';

import App from './app/app';
import { configureAppStores } from './app/storage';
import { appBridge, pendingNavigationStore } from './app/bridge';
import { shellCapabilities } from './app/bridge/shellCapabilities';
import { setImageLoadObserver } from './app/features/channels/hooks/useCachedImages';
import { setImageRefreshObserver } from './app/features/channels/hooks/useImageAddressRefresh';
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
    observeImageLoads,
    observeSocketRequests,
    observeStateOutbox,
} from './app/runtime/perf';
import { onUsageSessionStart, startAppIconUsage, startTelemetry } from './app/runtime/telemetry';
import { attachWebCrashSentinel } from './app/runtime/webCrashSentinel';
import { bootSplash } from './app/runtime/bootSplash';
import { setLaunchSessionOwner } from './app/runtime/launchSessionOwner';
import { recordActiveStores, recordPortChoices } from './app/runtime/activeStorage';
import { recordCheckoutOptions } from './app/runtime/checkoutOptions';
import { sendSessionOwnerDefault, sendSessionOwnerDefaultUnasked } from './app/runtime/sessionOwnerDefault';
import { showSessionOwnerUnsettled } from './app/runtime/sessionOwnerUnsettled';
import { dropSignedOutKeys } from './app/runtime/signedOutKeys';
import { initWebVitals } from './app/utils/webVitals';

setupBridgeLogger();
attachConsoleListener({ isDev: import.meta.env.DEV });

attachLogContext();

startLogUploader({
    isEnabled: createLogUploadSwitch(import.meta.env.VITE_LOG_UPLOAD_DISABLED === 'true'),
    keepDebug: import.meta.env.DEV,
});

reportRunIdJoin();

const stores = resolveStorageStores();
configureAppStores({ device: stores.device, tab: stores.tab });
recordActiveStores(stores);

syncThemeFromSharedKey(stores.webLocal);

const vault = stores.vault;
const webSessionCopyAtBoot = !vault && runtime.boot.hasWebSessionCopy(stores.webLocal);

const declaration = declareWebRuntime(stores);
const started = startRuntime(declaration);
recordCheckoutOptions(checkoutOptionsOf(declaration, readWebHostFacts()));

const adoptLateVault = (): void => {
    if (!webSessionCopyAtBoot) runtime.boot.discardWebSessionCopy(stores.webLocal);
    stores.webSession.set(LATE_VAULT_MARK, '1');
    window.location.reload();
};

const sessionOwnerDefaultEnv = {
    VITE_APP_SESSION_OWNER: import.meta.env.VITE_APP_SESSION_OWNER,
    VITE_SESSION_MIRROR_DISABLED: import.meta.env.VITE_SESSION_MIRROR_DISABLED,
};

const startApp = (owner: Exclude<SessionOwnerChoice, { sessionOwner: null }>): void => {
    if (owner.sessionOwner === 'native') {
        const dropSignedOut = () => {
            dropSignedOutKeys(stores.plain);
            runtime.boot.discardWebSessionCopy(stores.webLocal);
        };
        runtime.session.registerSessionLogoutCallback(dropSignedOut);
        if (new URLSearchParams(window.location.search).get('logout') === '1') dropSignedOut();
    }

    runtime.session.registerSessionLogoutCallback(clearComposerDrafts);
    runtime.session.registerSessionLogoutCallback(clearInputLocks);
    runtime.session.registerSessionLogoutCallback(clearNotifications);

    const webLogBoot = attachWebCrashSentinel();
    schedulePageCrashReport(webLogBoot);

    schedulePendingReportFlush();

    markBoot('main-start');

    bootSplash.armCap(10_000);
    initLongTasks();

    startTelemetry({
        context: readLogContext,
        allowPolicyOverride: import.meta.env.DEV,
        onReject: import.meta.env.DEV ? rejection => console.warn('[telemetry] refused', rejection) : undefined,
    });

    const webPerfTraces = configureWebPerfTraces();

    observeBridgeRequests({ client: webClient, runId: readInjectedRunId(), isHeld: webPerfTraces.isHeld });

    observeSocketRequests({
        observe: runtime.connection.observeSocketRequests,
        runId: readInjectedRunId(),
        isHeld: webPerfTraces.isHeld,
    });

    observeStateOutbox({
        setObserver: runtime.data.setStateOutboxObserver,
        runId: readInjectedRunId(),
        isHeld: webPerfTraces.isHeld,
    });

    observeImageLoads({
        setLoadObserver: setImageLoadObserver,
        setRefreshObserver: setImageRefreshObserver,
        isHeld: webPerfTraces.isHeld,
    });

    initWebVitals();

    pendingNavigationStore.start();

    void appBridge.notifyWebAppReady().then(report => {
        webPerfTraces.resolveWith(report);
        shellCapabilities.setReport(report);
        if (report) setNativeCacheSupport(report);
        if (owner.sessionOwner === 'web' && !vault && report?.supportedWebMessages?.includes('StorageGet')) {
            void adoptLateVault();
        }
        void sendSessionOwnerDefault(report, appBridge, sessionOwnerDefaultEnv);
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

    appBridge.setDebugMode(false);

    const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

    root.render(
        <StrictMode>
            <App />
        </StrictMode>
    );
};

void started.then(
    ({ owner = { sessionOwner: 'web' }, choices, engineChoice }) => {
        recordPortChoices({ storage: choices.storage.id, cache: choices.cache.id, engine: engineChoice.id });
        migrateLegacyPhoneCountry(stores.webLocal);
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
