import { createLogId, setLogContextProvider } from '@chatic/bridges';
import { getGlobalSessionContext } from '@chatic/web-core';

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
        const state = getGlobalSessionContext();
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

/** Test seam — forgets the locally issued runId. */
export const resetWebRunId = (): void => {
    webRunId = undefined;
};
