import type { RuntimeWireValue } from '@chatic/bridge-messages';
import type { ChatRefreshResult } from '@chatic/data';
import { logger } from '@chatic/logger';
import { slotKeyOf } from '@chatic/transport';

import type { ConnectionSnapshot, RuntimeConnection } from '../../engine/connection/runtimeConnection';
import type { CredentialGuard, RuntimeEngine } from '../../engine/engine';
import type { PageRepositories } from '../../engine/data/pageRepositories';
import type { RuntimeData } from '../../engine/data/runtimeData';
import type { SessionCommands } from '../../engine/session/commands';
import type { SessionSnapshot } from '../../engine/session/snapshot';
import type { ChatPrimeOutcome } from '../../engine/sync/primeChatRoom';
import type { RuntimeSync } from '../../engine/sync/runtimeSync';
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

export interface MirrorEngine extends RuntimeEngine {
    dispose(): void;
}

export interface MirrorEngineOptions {
    port: RuntimeMirrorPort;
    hello: { seq: number; session: RuntimeWireValue };
}

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

const notInMirror = (name: string): Error =>
    Object.assign(new Error(`${name} does not cross the bridge: it works only with the runtime in the page`), {
        code: RUNTIME_NOT_AVAILABLE_CODE,
    });

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
            const result = talk
                .call<ChatRefreshResult | null>(SYNC_TARGET, 'prefetchRoomFeed', [cid, channelId])
                .catch(() => null);
            if (connectionView.read().verifiedSlots.includes(slotKeyOf(cid))) traceRoomFetch(channelId, result);
            return result;
        },
        primeChatRoom: async (cid, channelId, options) => {
            markPrimeAsked(channelId);
            let outcome: ChatPrimeOutcome;
            try {
                outcome = await talk.call<ChatPrimeOutcome>(SYNC_TARGET, 'primeChatRoom', [cid, channelId]);
            } catch (error) {
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
