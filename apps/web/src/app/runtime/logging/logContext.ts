import { createLogId, isNative, logger, setLogContextProvider } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';

import { getRouteTrail } from '../../utils/routeTrail';

import type { LogContext } from '@chatic/bridges';

/**
 * Supplies the context stamped onto every entry at dispatch.
 *
 * Read fresh on every call rather than cached: these values change during a
 * session (login, cloud switch, navigation) and an entry must carry what was
 * true when it was written. Caching would relabel a queued entry with whatever
 * the session looks like when the queue finally drains.
 */

/** Bundler-injected web release version; not every host app defines it. */
declare const __APP_VERSION__: string;
const WEB_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined;

interface NativeGlobals {
    CHATIC_APP_RUN_ID?: string;
    CHATIC_APP_CURRENT_VERSION?: string;
    CHATIC_APP_PLATFORM?: string;
    CHATIC_APP_OS_VERSION?: string;
    CHATIC_APP_DEVICE_MODEL?: string;
}

const nativeGlobals = (): NativeGlobals => window as unknown as NativeGlobals;

let webRunId: string | undefined;

/**
 * The run id the native shell injected, or `undefined` outside the app WebView.
 *
 * Deliberately NOT the same thing as `resolveRunId()` below, which always
 * answers with something. A caller that needs "is this the app, and does it
 * share an id with us" — performance sampling does, since the two runtimes have
 * to reach the same verdict — must see the absence rather than a locally issued
 * substitute (ADR-0071).
 */
export const readInjectedRunId = (): string | undefined => nativeGlobals().CHATIC_APP_RUN_ID;

/**
 * Identifier for one app run — the primary axis for exploring logs, since
 * sid/uid/cid are all tenancy axes and cannot group "one launch".
 *
 * The native shell issues it at app start and injects it, so native and web
 * entries from the same launch share a value. Web deploys ahead of the app,
 * though, so a shell without the injection is expected: the web then issues its
 * own, which keeps web entries groupable at the cost of not matching the
 * native side until the app ships.
 */
const resolveRunId = (): string => {
    const injected = readInjectedRunId();
    if (injected) return injected;

    webRunId ??= createLogId();
    return webRunId;
};

export const readLogContext = (): LogContext => {
    const globals = nativeGlobals();
    const trail = getRouteTrail();

    let uid: string | undefined;
    let cid: string | undefined;
    let sid: string | undefined;

    try {
        const state = runtime.session.getGlobalSessionContext();
        uid = state.identity.userId ?? undefined;
        cid = state.cloud.cloudId ?? undefined;
        sid = state.cloud.siteId ?? undefined;
    } catch {
        // Logging must work before the session store is ready (boot, guest).
    }

    return {
        runId: resolveRunId(),
        uid,
        cid,
        sid,
        appVersion: globals.CHATIC_APP_CURRENT_VERSION,
        webVersion: WEB_VERSION,
        route: trail.at(-1),
        os: globals.CHATIC_APP_PLATFORM,
        osVersion: globals.CHATIC_APP_OS_VERSION,
        model: globals.CHATIC_APP_DEVICE_MODEL,
    };
};

/** Wires the provider into the logging core. Call before anything logs. */
export const attachLogContext = (): (() => void) => {
    setLogContextProvider(readLogContext);
    return () => setLogContextProvider(undefined);
};

/**
 * Says so when this run's native and web entries will not join.
 *
 * `runId` is the only axis that groups one launch, and it is also the only thing tying a native
 * entry to a web one: the native half carries no `uid`/`sid`/`cid`/`route`, because the native
 * runtime does not know them. So inside the app, a missing injection does not merely cost a shared
 * id — it strands every native entry with no way back to a user. The web mints its own so that at
 * least the web half stays groupable, and that substitution is silent: two runIds for one launch
 * look exactly like two launches.
 *
 * Reported once, at `warn`, and **only inside the app**. In a plain browser there is no native half
 * to join, so a locally minted id is simply the right answer and nothing is wrong.
 *
 * Called separately from `attachLogContext` rather than inside it because of the boot ordering in
 * `main.tsx`: the context provider is registered before the upload queue subscribes, so an entry
 * emitted at that point would be published to nobody. This runs after the queue is wired.
 */
export const reportRunIdJoin = (): void => {
    if (!isNative()) return;
    if (readInjectedRunId()) return;

    logger.warn('APP', 'no native runId injected — native and web entries cannot be joined this run', {
        webRunId: resolveRunId(),
    });
};

/** Test seam — forgets the locally issued runId. */
export const resetWebRunId = (): void => {
    webRunId = undefined;
};
