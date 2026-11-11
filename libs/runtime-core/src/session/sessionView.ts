import { isInOwnCloudSession, isPairedSession, pairedClouds } from '@chatic/auth';
import {
    cloudStore,
    getActiveSessionUser,
    getCommittedSessionSiteId,
    getGlobalSessionContext,
    getRelaySessionUser,
    getSessionAuthSnapshot,
    getUidsInClouds,
    sessionSignal,
    subscribeSessionSignal,
} from '@chatic/session';
import type { GlobalSessionContext, IdentityContext } from '@chatic/session';
import { backgroundClouds } from '@chatic/transport';

import type {
    ActiveServerView,
    IdentityView,
    SessionAuthView,
    SessionContextView,
    SessionSnapshot,
    SessionView,
} from './snapshot';

/** The value `project` made from the last source, while the source is the same object. */
const memoBySource = <Source, Value>(project: (source: Source) => Value) => {
    let last: { source: Source; value: Value } | null = null;
    return (source: Source): Value => {
        if (!last || last.source !== source) last = { source, value: project(source) };
        return last.value;
    };
};

/**
 * The previous value while `next` reads the same as JSON. For the parts the stores rebuild on every
 * read (a token's user fields, the paired list), so an unchanged part keeps its identity.
 */
const memoByContent = <Value>() => {
    let last: { text: string; value: Value } | null = null;
    return (next: Value): Value => {
        const text = JSON.stringify(next) ?? 'undefined';
        if (!last || last.text !== text) last = { text, value: next };
        return last.value;
    };
};

const messageOf = (error: unknown): string | null => {
    if (error === null || error === undefined) return null;
    return error instanceof Error ? error.message : String(error);
};

const toIdentityView = (identity: IdentityContext): IdentityView => ({
    isInitialized: identity.isInitialized,
    isAuthenticated: identity.isAuthenticated,
    error: messageOf(identity.error),
    userId: identity.userId,
    delegatorId: identity.delegatorId,
});

const toActiveServerView = (server: GlobalSessionContext['activeServer']): ActiveServerView =>
    server.kind === 'cloud'
        ? { kind: 'cloud', cloudId: server.cloudId, siteId: server.siteId, backend: server.backend, wss: server.wss }
        : { kind: 'relay', backend: server.backend, wss: server.wss, siteId: server.siteId };

/**
 * The session view over this process's stores — what the core engine hands the React surface.
 *
 * The stores rebuild their context on every session signal and hold it until the next one; this view
 * follows the same rhythm, and also re-reads when a source moves that has no session signal: the
 * background clouds, the token cache and the recorded identities (a cloud's uid), and the paired
 * clouds. Each part keeps its identity until it changes, so a reader of the identity does not
 * re-render for a paired cloud's new name.
 */
export const createCoreSessionView = (): SessionView => {
    let stale = true;
    let wired = false;
    let current: SessionSnapshot | null = null;

    const markStale = (): void => {
        stale = true;
    };

    // Marking stale has to happen before any reader is told: the session signal runs its invalidators
    // eagerly, ahead of its listeners, and the stores below call listeners in the order they were
    // added — these are added before the first reader's, because every reader goes through `ensureWired`.
    const ensureWired = (): void => {
        if (wired) return;
        wired = true;
        sessionSignal.registerInvalidator(markStale);
        backgroundClouds.subscribe(markStale);
        pairedClouds.subscribe(markStale);
        pairedClouds.subscribeNames(markStale);
        cloudStore.subscribeUidSources(markStale);
    };

    const identityView = memoBySource(toIdentityView);
    const contextView = memoBySource(
        (context: GlobalSessionContext): SessionContextView => ({
            relay: {
                backend: context.relay.backend,
                wss: context.relay.wss,
                siteId: context.relay.siteId,
                isAuthenticated: context.relay.isAuthenticated,
            },
            cloud: {
                cloudId: context.cloud.cloudId,
                siteId: context.cloud.siteId,
                backend: context.cloud.backend,
                wss: context.cloud.wss,
                isActive: context.cloud.isActive,
            },
            identity: identityView(context.identity),
            activeServer: toActiveServerView(context.activeServer),
        })
    );
    const authView = memoBySource(
        (auth: ReturnType<typeof getSessionAuthSnapshot>): SessionAuthView => ({
            isInitialized: auth.isInitialized,
            isAuthenticated: auth.isAuthenticated,
            error: messageOf(auth.error),
        })
    );
    const activeUser = memoByContent<SessionSnapshot['activeUser']>();
    const relayUser = memoByContent<SessionSnapshot['relayUser']>();
    const uidByCloud = memoByContent<SessionSnapshot['uidByCloud']>();
    const pairing = memoByContent<SessionSnapshot['pairing']>();

    const read = (): SessionSnapshot => ({
        context: contextView(getGlobalSessionContext()),
        auth: authView(getSessionAuthSnapshot()),
        activeUser: activeUser(getActiveSessionUser()),
        relayUser: relayUser(getRelaySessionUser()),
        committedSiteId: getCommittedSessionSiteId(),
        uidByCloud: uidByCloud(getUidsInClouds()),
        pairing: pairing({
            isPairedSession: isPairedSession(),
            isInOwnCloudSession: isInOwnCloudSession(),
            cloudIds: pairedClouds.list(),
            cloudNames: pairedClouds.names(),
        }),
    });

    const samePartsAs = (previous: SessionSnapshot, next: SessionSnapshot): boolean =>
        (Object.keys(next) as (keyof SessionSnapshot)[]).every(key => previous[key] === next[key]);

    return {
        snapshot() {
            ensureWired();
            if (current && !stale) return current;
            // Marked fresh only once the read succeeded: a read that throws (the stores not wired yet)
            // is tried again on the next call, not left behind an older snapshot until a signal.
            const next = read();
            stale = false;
            if (!current || !samePartsAs(current, next)) current = next;
            return current;
        },

        subscribe(listener) {
            ensureWired();
            const offSession = subscribeSessionSignal(listener);
            const offBackground = backgroundClouds.subscribe(listener);
            const offPaired = pairedClouds.subscribe(listener);
            const offNames = pairedClouds.subscribeNames(listener);
            const offUids = cloudStore.subscribeUidSources(listener);
            return () => {
                offSession();
                offBackground();
                offPaired();
                offNames();
                offUids();
            };
        },
    };
};
