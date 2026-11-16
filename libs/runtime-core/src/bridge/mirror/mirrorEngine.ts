import type { RuntimeWireValue } from '@chatic/bridge-messages';
import type { ChatRefreshResult } from '@chatic/data';
import { logger } from '@chatic/logger';
import { slotKeyOf } from '@chatic/transport';

import type { ConnectionSnapshot, RuntimeConnection } from '../../connection/runtimeConnection';
import type { CredentialGuard, RuntimeEngine } from '../../engine';
import type { PageRepositories } from '../../data/pageRepositories';
import type { RuntimeData } from '../../data/runtimeData';
import type { SessionCommands } from '../../session/commands';
import type { SessionSnapshot } from '../../session/snapshot';
import type { ChatPrimeOutcome } from '../../sync/primeChatRoom';
import type { RuntimeSync } from '../../sync/runtimeSync';
import {
    CONNECTION_TARGET,
    SESSION_COMMAND_METHODS,
    SESSION_COMMANDS_TARGET,
    SYNC_TARGET,
    VIEW_STREAMS,
} from '../contract';
import { RUNTIME_NOT_AVAILABLE_CODE } from '../errors';
import { DATA_CLOUD_TARGET, DATA_TARGET, REPOSITORY_METHODS } from '../repositories';
import { createMirrorConversation } from './conversation';
import type { MirrorConversation } from './conversation';
import type { RuntimeMirrorPort } from './port';
import { markPrimeAsked, traceRoomFetch } from './roomTrace';
import { createSessionMirror } from './sessionMirror';
import { shareStructure } from './shareStructure';

/** A mirror engine, and the way to stop hearing the runtime it mirrors. */
export interface MirrorEngine extends RuntimeEngine {
    /** Ends every stream the mirror holds and stops taking session pushes. */
    dispose(): void;
}

export interface MirrorEngineOptions {
    port: RuntimeMirrorPort;
    /** The session as the hello's `native` answer carried it. */
    hello: { seq: number; session: RuntimeWireValue };
}

/** The connection as a page shows it before the first mirrored snapshot arrives: idle, nothing verified. */
const INITIAL_CONNECTION: ConnectionSnapshot = {
    active: {
        state: 'idle',
        isConnected: false,
        isVerified: false,
        connectionId: null,
    } as ConnectionSnapshot['active'],
    verifiedSlots: [],
    online: true,
};

const noop = () => undefined;

/** A member that works only where the runtime runs in the page's own process (`local` in the contract). */
const notInMirror = (name: string): Error =>
    Object.assign(new Error(`${name} does not cross the bridge: it works only with the runtime in the page`), {
        code: RUNTIME_NOT_AVAILABLE_CODE,
    });

/** A wait that never rejects in-process: a bridge failure is a `false`, and logged. */
const neverRejects = (wait: Promise<boolean>, name: string): Promise<boolean> =>
    wait.catch(error => {
        logger.warn('WEB_CORE', 'A mirrored wait failed', { error, data: { call: name } });
        return false;
    });

const inertGuard = <Policy>(): CredentialGuard<Policy> => ({
    check: async () => undefined,
    start: () => noop,
    setPolicy: noop,
});

/**
 * A view mirrored through its stream (`VIEW_STREAMS`): read synchronously, changed when an event
 * carries a value that differs, with the identities of the unchanged parts kept.
 */
const mirrorView = <T>(talk: MirrorConversation, target: keyof typeof VIEW_STREAMS, initial: T) => {
    let value = initial;
    const listeners = new Set<() => void>();
    talk.open(target, VIEW_STREAMS[target], [], event => {
        const [next] = event as [T];
        const shared = shareStructure(value, next);
        if (shared === value) return;
        value = shared;
        [...listeners].forEach(listener => {
            try {
                listener();
            } catch (error) {
                logger.error('WEB_CORE', 'A mirrored view listener threw', { error, data: { view: target } });
            }
        });
    });
    return {
        read: (): T => value,
        subscribe: (listener: () => void): (() => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
};

/**
 * A repository graph whose every method crosses: a call per method, and an `observe*` method as a
 * stream whose listener is the method's function argument. `prefix` comes before the method's own
 * arguments — the cloud id, for a cloud's graph.
 */
const mirrorGraph = (talk: MirrorConversation, target: string, prefix: readonly unknown[]): PageRepositories => {
    const graph: Record<string, Record<string, (...args: unknown[]) => unknown>> = {};
    for (const [repository, methods] of Object.entries(REPOSITORY_METHODS)) {
        const members: Record<string, (...args: unknown[]) => unknown> = {};
        for (const [method, crossing] of Object.entries(
            methods as Record<string, 'call' | 'receipt' | 'stream' | 'send' | 'local'>
        )) {
            const name = `${repository}.${method}`;
            members[method] =
                crossing === 'call'
                    ? (...args) => talk.call(target, name, [...prefix, ...args])
                    : crossing === 'receipt'
                      ? (...args) => talk.receipt(target, name, [...prefix, ...args])
                      : crossing === 'send'
                        ? (...args) => talk.send(target, name, [...prefix, ...args])
                        : crossing === 'local'
                          ? () => {
                                throw notInMirror(`${target}.${name}`);
                            }
                          : (...args) => {
                                const at = args.findIndex(arg => typeof arg === 'function');
                                if (at < 0) throw new Error(`${name} takes a listener`);
                                return talk.listen(
                                    target,
                                    name,
                                    [...prefix, ...args],
                                    prefix.length + at,
                                    args[at] as (...event: never[]) => void
                                );
                            };
        }
        graph[repository] = members;
    }
    return graph as unknown as PageRepositories;
};

/**
 * The engine of a page that mirrors a runtime running elsewhere — on the phone, the shell's. It has every
 * member the in-process engine has, so the React surface cannot tell which it was given; each member
 * crosses as the contract says (`contract.ts`, `repositories.ts`):
 *
 * - **The session** is the hello's snapshot, then each session push in number order
 *   (`createSessionMirror`). A command is one call; the shell sends the push for what the command did
 *   before it answers, so the command resolves with the snapshot already showing it.
 * - **Views** — the connection's snapshot, the refused rooms — are streams opened at once, read
 *   synchronously. Until the first value arrives the connection reads idle and no room is refused.
 * - **Calls** answer with the member's result; a `void` member (`setBackgroundClouds`,
 *   `setOwnedClouds`, `updateLocalSnapshot`, a repository's `send` methods) is sent without waiting, and
 *   a failure is logged. A wait that never rejects in-process (`waitUntilVerified`,
 *   `waitForCloudSocket`) answers `false` when the bridge fails.
 * - **Streams** — `observe*`, `onServerEvent`, `onBackgroundDelta`, a target registration, a cloud hold — stop
 *   synchronously, as in-process.
 * - **Local members** (`requestOnSlot`, `onServerMessage`, a repository's `local` methods) throw
 *   `RUNTIME_NOT_AVAILABLE`: a raw request, raw frames and a synchronous answer do not cross.
 * - **Lifecycle members** do nothing. The controllers, the credential guards and push registration run
 *   where the runtime runs; a page that mirrors only reads the outcome. The session controller reports
 *   ready once the mirrored session is initialised.
 * - **A room's trace** is marked around its prime and first fetch (`roomTrace.ts`), since those run where
 *   the trace is not.
 *
 * What crosses is JSON: a result that held a `Date` arrives as its ISO string, `undefined` as `null`.
 */
export const createMirrorEngine = ({ port, hello }: MirrorEngineOptions): MirrorEngine => {
    const talk = createMirrorConversation(port);
    const session = createSessionMirror({ seq: hello.seq, session: hello.session as unknown as SessionSnapshot });
    const offSession = port.onSessionChanged(payload => session.apply(payload));

    const commands = Object.fromEntries(
        SESSION_COMMAND_METHODS.map(method => [
            method,
            (...args: unknown[]) => talk.call(SESSION_COMMANDS_TARGET, method, args),
        ])
    ) as unknown as SessionCommands;

    const connectionView = mirrorView<ConnectionSnapshot>(talk, CONNECTION_TARGET, INITIAL_CONNECTION);
    const refusedView = mirrorView<string[]>(talk, SYNC_TARGET, []);

    const connection: RuntimeConnection = {
        snapshot: connectionView.read,
        subscribe: connectionView.subscribe,
        waitUntilVerified: (slot, timeoutMs) =>
            neverRejects(
                talk.call<boolean>(CONNECTION_TARGET, 'waitUntilVerified', [slot, timeoutMs]),
                'connection.waitUntilVerified'
            ),
        requestOnSlot: () => Promise.reject(notInMirror('connection.requestOnSlot')),
        onServerEvent: (type, listener, options) =>
            talk.listen(CONNECTION_TARGET, 'onServerEvent', [type, listener, options], 1, listener),
        onServerMessage: () => {
            throw notInMirror('connection.onServerMessage');
        },
        observeRequests: observer => talk.listen(CONNECTION_TARGET, 'observeRequests', [observer], 0, observer),
        slotStatuses: () => talk.call(CONNECTION_TARGET, 'slotStatuses'),
        reconnect: () => talk.call(CONNECTION_TARGET, 'reconnect'),
        recoverUnverified: () => talk.call(CONNECTION_TARGET, 'recoverUnverified'),
        recoverOnResume: () => talk.call(CONNECTION_TARGET, 'recoverOnResume'),
        setBackgroundClouds: cloudIds => talk.send(CONNECTION_TARGET, 'setBackgroundClouds', [cloudIds]),
        setOwnedClouds: (owned, alsoInvited) => talk.send(CONNECTION_TARGET, 'setOwnedClouds', [owned, alsoInvited]),
    };

    const sync: RuntimeSync = {
        registerTarget: (target, options) => talk.open(SYNC_TARGET, 'registerTarget', [target, options], noop),
        updateLocalSnapshot: (target, snapshot, options) =>
            talk.send(SYNC_TARGET, 'updateLocalSnapshot', [target, snapshot, options]),
        listTargets: () => talk.call(SYNC_TARGET, 'listTargets'),
        refreshBackgroundClouds: cid => talk.call(SYNC_TARGET, 'refreshBackgroundClouds', [cid]),
        onBackgroundDelta: listener => talk.listen(SYNC_TARGET, 'onBackgroundDelta', [listener], 0, listener),
        isChannelRefused: channelId => refusedView.read().includes(channelId),
        subscribeRefusedChannels: refusedView.subscribe,
        refusedChannels: refusedView.read,
        fetchRoomFeed: (cid, channelId, options) => {
            const result = talk.call<ChatRefreshResult>(SYNC_TARGET, 'fetchRoomFeed', [cid, channelId, options]);
            traceRoomFetch(channelId, result);
            return result;
        },
        prefetchRoomFeed: (cid, channelId) => {
            // Never rejects, as in-process: the room fetches on its own if this did not start.
            const result = talk
                .call<ChatRefreshResult | null>(SYNC_TARGET, 'prefetchRoomFeed', [cid, channelId])
                .catch(() => null);
            // In-process the prefetch starts nothing, and takes no trace, while the cloud's socket is not
            // verified; the mirrored snapshot says the same here.
            if (connectionView.read().verifiedSlots.includes(slotKeyOf(cid))) traceRoomFetch(channelId, result);
            return result;
        },
        primeChatRoom: async (cid, channelId, options) => {
            markPrimeAsked(channelId);
            let outcome: ChatPrimeOutcome;
            try {
                // `cancelled` is a function and stays here: a late outcome is dropped instead.
                outcome = await talk.call<ChatPrimeOutcome>(SYNC_TARGET, 'primeChatRoom', [cid, channelId]);
            } catch (error) {
                // Never thrown, as in-process: a failure is the `failed` outcome.
                logger.warn('SOCKET', '[useChatSync] Failed to prime chat target', { error, data: { channelId, cid } });
                outcome = 'failed';
            }
            return options?.cancelled?.() ? 'cancelled' : outcome;
        },
    };

    const liveGraph = mirrorGraph(talk, DATA_TARGET, []);
    const cloudGraphs = new Map<string, PageRepositories>();

    const data: RuntimeData = {
        repositories: () => liveGraph,
        cloudRepositories: cid => {
            let graph = cloudGraphs.get(cid);
            if (!graph) {
                graph = mirrorGraph(talk, DATA_CLOUD_TARGET, [cid]);
                cloudGraphs.set(cid, graph);
            }
            return graph;
        },
        sendChatInCloud: (cid, payload) => talk.call(DATA_TARGET, 'sendChatInCloud', [cid, payload]),
        waitForCloudSocket: (cid, timeoutMs) =>
            neverRejects(
                talk.call<boolean>(DATA_TARGET, 'waitForCloudSocket', [cid, timeoutMs]),
                'data.waitForCloudSocket'
            ),
        // Stands while open: the shell holds the cloud's socket until the page stops it.
        holdCloud: cid => talk.open(DATA_TARGET, 'holdCloud', [cid], noop),
        recoverInvitedCloud: cloudId => talk.call(DATA_TARGET, 'recoverInvitedCloud', [cloudId]),
        syncInvitedCloudName: cloudId => talk.call(DATA_TARGET, 'syncInvitedCloudName', [cloudId]),
        syncPairedCloudName: cloudId => talk.call(DATA_TARGET, 'syncPairedCloudName', [cloudId]),
        clearLocalCaches: () => talk.call(DATA_TARGET, 'clearLocalCaches'),
        requestSyncCursorReset: () => talk.call(DATA_TARGET, 'requestSyncCursorReset'),
        observeStateOutbox: observer => talk.listen(DATA_TARGET, 'observeStateOutbox', [observer], 0, observer),
        cacheMetrics: () => talk.call(DATA_TARGET, 'cacheMetrics'),
        resetCacheMetrics: () => talk.call(DATA_TARGET, 'resetCacheMetrics'),
        searchCache: (keyword, options) => talk.call(DATA_TARGET, 'searchCache', [keyword, options]),
        resolveCacheContext: refs => talk.call(DATA_TARGET, 'resolveCacheContext', [refs]),
        registerDeviceToken: (body, options) => talk.call(DATA_TARGET, 'registerDeviceToken', [body, options]),
    };

    return {
        session,
        commands,
        connection,
        sync,
        data,
        sessionController: () => ({
            initialize: async () => undefined,
            isReady: () => session.snapshot().auth.isInitialized,
            subscribeReady: listener => session.subscribe(listener),
            startGuestKeepAlive: () => noop,
        }),
        connectionController: () => ({
            startBackground: () => noop,
            startSockets: () => noop,
            subscribeSocketPass: () => noop,
            getSocketPassVersion: () => 0,
            flushSockets: noop,
        }),
        relayCredentialGuard: () => inertGuard(),
        cloudCredentialGuard: () => inertGuard(),
        pushRegistration: () => ({ start: () => noop, notifyForeground: noop }),
        dispose: () => {
            offSession();
            talk.dispose();
        },
    };
};
