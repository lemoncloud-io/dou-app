import {
    type ClientSocketErrorEvent,
    type ClientSocketMessageEvent,
    type ClientSocketState,
    type ClientSocketStateEvent,
    type ClientSocketV2,
    type SocketMessage,
    createClientSocketV2,
} from '@lemoncloud/chatic-sockets-lib';

import { logger } from '@chatic/logger';
import { pageHideCount, perfNow } from '@chatic/perf';
import type {
    ISocketManager,
    ScopedSocketClient,
    SocketBindingConfig,
    SlotKey,
    SlotStatus,
    SocketClientListener,
    SocketKind,
    SocketRequestSample,
    SocketSlotClientListener,
    SocketState,
    SocketStateListener,
} from './types';
import { AUTH_OPTIONS, DEFAULT_VERIFY_TIMEOUT_MS, INITIAL_SOCKET_STATE } from './constants';
import { hasResumeKick } from './socketVerifyTrace';
import { transportPlatform } from '../platform';
import { resolveSocketDevice } from './devicePlatform';
import { socketFailureReporter } from './socketFailureReporter';
import { annotateSocketError } from './utils/annotateSocketError';
import { type SocketCloseEvent, type SocketCloseReason, classifySocketClose } from './utils/closeReason';
import { type ErrorCodeLedger, createErrorCodeLedger } from './utils/errorCodeLedger';
import { getSocketErrorCode } from './utils/socketErrorCode';
import { RELAY_SLOT, kindOf, slotKeyOf } from './utils/slotKey';

type TypeListenerEntry = {
    type: string;
    listener: (message: SocketMessage<any>) => void;
    unsubscribe?: () => void;
};

type SlotTypeListenerEntry = TypeListenerEntry & { key: SlotKey };

interface ClientEntry {
    client: ClientSocketV2;
    config: SocketBindingConfig;
    authenticated: boolean;
    connState: ClientSocketState;
    connectCount: number;
    errorCodes: ErrorCodeLedger;
    lastClose: SocketCloseReason | undefined;
    closingLocally: boolean;
    openedAt: number | undefined;
    firstConnectSince: number | undefined;
    hasConnected: boolean;
    tearingDown: boolean;
    unsubscribes: Array<() => void>;
}

type TransportCloseSource = {
    on?: (type: 'close', listener: (event: SocketCloseEvent | undefined) => void) => () => void;
};

export class SocketManager implements ISocketManager {
    private readonly entries = new Map<SlotKey, ClientEntry>();
    private state: SocketState = INITIAL_SOCKET_STATE;

    private readonly stateListeners = new Set<SocketStateListener>();
    private readonly clientListeners = new Set<SocketClientListener>();
    private readonly slotClientListeners = new Set<SocketSlotClientListener>();
    private readonly slotVerifiedListeners = new Set<(key: SlotKey) => void>();
    private readonly typeListeners = new Set<TypeListenerEntry>();
    private readonly slotTypeListeners = new Set<SlotTypeListenerEntry>();
    private requestedActive: SlotKey | null = null;
    private lastActiveKey: SlotKey | null = null;
    private requestObserver: ((sample: SocketRequestSample) => void) | undefined;

    public ensure(config: SocketBindingConfig): ClientSocketV2 {
        const key = slotKeyOf(config.cid);
        if (config.wssType && config.wssType !== kindOf(key)) {
            throw new Error(`[SocketManager] a ${config.wssType} config cannot bind the ${kindOf(key)} slot "${key}"`);
        }
        const existing = this.entries.get(key);
        if (existing && this.isSameConfig(existing.config, config)) {
            return existing.client;
        }

        const prevActiveClient = this.getActiveClient();
        if (existing) {
            this.teardownEntry(key);
        }

        const client = this.createClient(config);
        const entry: ClientEntry = {
            client,
            config,
            authenticated: false,
            connState: client.state,
            connectCount: 0,
            errorCodes: createErrorCodeLedger(),
            lastClose: undefined,
            closingLocally: false,
            openedAt: undefined,
            firstConnectSince: undefined,
            hasConnected: false,
            tearingDown: false,
            unsubscribes: [],
        };
        this.entries.set(key, entry);
        this.bindEntry(key, entry);
        logger.info('SOCKET', '[SocketManager] slot bound', { data: { cid: key, kind: kindOf(key) } });

        this.notifySlotClient(key, client);
        this.syncActive(prevActiveClient);
        return client;
    }

    public setActiveSlot(key: SlotKey | null): void {
        const prevActiveClient = this.getActiveClient();
        this.requestedActive = key;
        this.syncActive(prevActiveClient);
    }

    public getClient(key?: SlotKey): ClientSocketV2 | null {
        if (key) {
            return this.entries.get(key)?.client ?? null;
        }
        return this.getActiveClient();
    }

    public getSlotKeys(): SlotKey[] {
        return [...this.entries.keys()];
    }

    public getBoundCid(): string | null {
        return this.getActiveKey();
    }

    public getScopedClient(key: SlotKey): ScopedSocketClient {
        const kind = kindOf(key);
        const requireSlot = (action: string): ClientEntry => {
            const entry = this.entries.get(key);
            if (!entry) {
                throw new Error(`[SocketManager] no ${kind} slot bound for ${action}`);
            }
            return entry;
        };
        return {
            request: <T = unknown>(type: string, data?: unknown, options?: { timeoutMs?: number }): Promise<T> => {
                const entry = requireSlot(`request(${type})`);
                const { client, errorCodes } = entry;
                const settle = this.timeRequest(entry, kind, type);
                return (client.request(type as any, data as any, options) as Promise<T>).then(
                    value => {
                        settle();
                        socketFailureReporter.recordSuccess(key);
                        return value;
                    },
                    error => {
                        errorCodes.attach(error);
                        settle(error);
                        const annotated = annotateSocketError(error, kind, 'request', type);
                        socketFailureReporter.recordFailure(key, 'request', type, annotated);
                        throw annotated;
                    }
                );
            },
            send: <T = unknown>(type: string | SocketMessage<T>, data?: T): void => {
                const { client } = requireSlot('send()');
                const name = typeof type === 'string' ? type : type.type;
                try {
                    if (typeof type === 'string') {
                        client.send(type as any, data as any);
                        socketFailureReporter.recordSuccess(key);
                        return;
                    }
                    client.send(type);
                    socketFailureReporter.recordSuccess(key);
                } catch (error) {
                    const annotated = annotateSocketError(error, kind, 'send', name);
                    socketFailureReporter.recordFailure(key, 'send', name, annotated);
                    throw annotated;
                }
            },
            onType: <T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): (() => void) =>
                this.onSlotType<T>(key, type, listener),
        };
    }

    public getSnapshot(): SocketState {
        return this.state;
    }

    public isSlotVerified(key: SlotKey): boolean {
        const entry = this.entries.get(key);
        if (!entry) return false;
        return entry.authenticated && entry.connState === 'connected';
    }

    public firstConnectSince(key: SlotKey): number | undefined {
        return this.entries.get(key)?.firstConnectSince;
    }

    public getSlotStatuses(): SlotStatus[] {
        const active = this.getActiveKey();
        return [...this.entries]
            .map(([key, entry]) => ({
                key,
                kind: kindOf(key),
                active: key === active,
                state: entry.connState,
                verified: entry.authenticated && entry.connState === 'connected',
                connectCount: entry.connectCount,
            }))
            .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'relay' ? -1 : 1));
    }

    public subscribe(listener: SocketStateListener): () => void {
        this.stateListeners.add(listener);
        listener(this.state);
        return () => {
            this.stateListeners.delete(listener);
        };
    }

    public waitUntilVerified(timeoutMs: number = DEFAULT_VERIFY_TIMEOUT_MS): Promise<boolean> {
        if (this.state.isVerified) {
            return Promise.resolve(true);
        }
        return new Promise<boolean>(resolve => {
            let settled = false;
            let unsubscribe: (() => void) | null = null;
            const finish = (verified: boolean) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                unsubscribe?.();
                resolve(verified);
            };
            const timer = setTimeout(() => finish(false), timeoutMs);
            unsubscribe = this.subscribe(state => {
                if (state.isVerified) finish(true);
            });
        });
    }

    public waitUntilSlotVerified(key: SlotKey, timeoutMs: number = DEFAULT_VERIFY_TIMEOUT_MS): Promise<boolean> {
        if (this.isSlotVerified(key)) {
            return Promise.resolve(true);
        }
        return new Promise<boolean>(resolve => {
            let settled = false;
            const finish = (verified: boolean) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.slotVerifiedListeners.delete(onChange);
                resolve(verified);
            };
            const timer = setTimeout(() => finish(false), timeoutMs);
            const onChange = (changed: SlotKey) => {
                if (changed === key && this.isSlotVerified(key)) finish(true);
            };
            this.slotVerifiedListeners.add(onChange);
        });
    }

    public subscribeSlotVerified(key: SlotKey, listener: (verified: boolean) => void): () => void {
        listener(this.isSlotVerified(key));
        const onChange = (changed: SlotKey) => {
            if (changed === key) listener(this.isSlotVerified(key));
        };
        this.slotVerifiedListeners.add(onChange);
        return () => {
            this.slotVerifiedListeners.delete(onChange);
        };
    }

    public subscribeClient(listener: SocketClientListener): () => void {
        this.clientListeners.add(listener);
        listener(this.getActiveClient());
        return () => {
            this.clientListeners.delete(listener);
        };
    }

    public subscribeSlotClients(listener: SocketSlotClientListener): () => void {
        this.slotClientListeners.add(listener);
        for (const [key, entry] of this.entries) {
            listener(key, entry.client);
        }
        return () => {
            this.slotClientListeners.delete(listener);
        };
    }

    public setAuthenticated(key: SlotKey, value: boolean): void {
        const entry = this.entries.get(key);
        if (!entry) return;
        entry.authenticated = value;
        this.notifySlotVerified(key);
        if (this.getActiveKey() === key) {
            this.setState(this.computeState(entry));
        }
    }

    public async connect(key: SlotKey): Promise<void> {
        const entry = this.entries.get(key);
        if (!entry) return;
        if (entry.client.state === 'idle' || entry.client.state === 'closed') {
            await entry.client.connect();
        }
    }

    public async request<T = unknown>(type: string, data?: unknown, options?: { timeoutMs?: number }): Promise<T> {
        const client = this.requireActiveClient(`request(${type})`);
        const key = this.getActiveKey()!;
        const entry = this.entries.get(key);
        const errorCodes = entry?.errorCodes;
        const settle = this.timeRequest(entry, kindOf(key), type);
        try {
            const value = (await client.request(type as any, data as any, options)) as T;
            settle();
            socketFailureReporter.recordSuccess(key);
            return value;
        } catch (error) {
            errorCodes?.attach(error);
            settle(error);
            const annotated = annotateSocketError(error, kindOf(key), 'request', type);
            socketFailureReporter.recordFailure(key, 'request', type, annotated);
            throw annotated;
        }
    }

    public setRequestObserver(observer: ((sample: SocketRequestSample) => void) | undefined): void {
        this.requestObserver = observer;
    }

    private timeRequest(entry: ClientEntry | undefined, kind: SocketKind, type: string): (error?: unknown) => void {
        const observer = this.requestObserver;
        if (!observer) return () => undefined;
        const startedAt = perfNow();
        const hidesAtStart = pageHideCount();
        let settled = false;
        return (...args: [unknown?]) => {
            if (settled || pageHideCount() !== hidesAtStart) return;
            settled = true;
            const outcome = args.length === 0 ? 'ok' : String(getSocketErrorCode(args[0]) ?? 'error');
            const sample: SocketRequestSample = { type, kind, outcome, roundTripMs: Math.round(perfNow() - startedAt) };
            if (outcome === '499') sample.closeReason = entry?.lastClose ?? 'transport';
            try {
                observer(sample);
            } catch (error) {
                logger.warn('SOCKET', '[SocketManager] request observer threw', { error, data: { type } });
            }
        };
    }

    public send<T = unknown>(type: string | SocketMessage<T>, data?: T): void {
        const client = this.requireActiveClient('send()');
        const key = this.getActiveKey()!;
        const name = typeof type === 'string' ? type : type.type;
        try {
            if (typeof type === 'string') {
                client.send(type as any, data as any);
                socketFailureReporter.recordSuccess(key);
                return;
            }
            client.send(type);
            socketFailureReporter.recordSuccess(key);
        } catch (error) {
            const annotated = annotateSocketError(error, kindOf(key), 'send', name);
            socketFailureReporter.recordFailure(key, 'send', name, annotated);
            throw annotated;
        }
    }

    public onType<T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): () => void {
        const entry: TypeListenerEntry = {
            type,
            listener: listener as (message: SocketMessage<any>) => void,
        };
        this.typeListeners.add(entry);
        this.bindTypeListener(entry, this.getActiveClient());

        return () => {
            entry.unsubscribe?.();
            this.typeListeners.delete(entry);
        };
    }

    public onSlotType<T = unknown>(
        key: SlotKey,
        type: string,
        listener: (message: SocketMessage<T>) => void
    ): () => void {
        const entry: SlotTypeListenerEntry = {
            key,
            type,
            listener: listener as (message: SocketMessage<any>) => void,
        };
        this.slotTypeListeners.add(entry);
        this.bindSlotTypeListener(entry, this.entries.get(key)?.client ?? null);

        return () => {
            entry.unsubscribe?.();
            this.slotTypeListeners.delete(entry);
        };
    }

    public onMessage(listener: (event: ClientSocketMessageEvent) => void): () => void {
        return this.requireActiveClient('onMessage()').onMessage(listener);
    }

    public onState(listener: (event: ClientSocketStateEvent) => void): () => void {
        return this.requireActiveClient('onState()').onState(listener);
    }

    public onError(listener: (event: ClientSocketErrorEvent) => void): () => void {
        return this.requireActiveClient('onError()').onError(listener);
    }

    public disconnect(code?: number, reason?: string): Promise<void> {
        return this.requireActiveClient('disconnect()').disconnect(code, reason);
    }

    public destroy(key?: SlotKey): void {
        const prevActiveClient = this.getActiveClient();
        if (key) {
            this.teardownEntry(key);
        } else {
            for (const key of [...this.entries.keys()]) {
                this.teardownEntry(key);
            }
            this.requestedActive = null;
        }
        this.syncActive(prevActiveClient);
    }

    private getActiveKey(): SlotKey | null {
        if (this.requestedActive && this.entries.has(this.requestedActive)) return this.requestedActive;
        return this.entries.has(RELAY_SLOT) ? RELAY_SLOT : null;
    }

    private getActiveEntry(): ClientEntry | null {
        const key = this.getActiveKey();
        return key ? (this.entries.get(key) ?? null) : null;
    }

    private getActiveClient(): ClientSocketV2 | null {
        return this.getActiveEntry()?.client ?? null;
    }

    private computeState(entry: ClientEntry | null): SocketState {
        if (!entry) return INITIAL_SOCKET_STATE;
        const connected = entry.connState === 'connected';
        return {
            state: entry.connState,
            isConnected: connected,
            isVerified: entry.authenticated && connected,
            connectionId: null,
        };
    }

    private syncActive(prevActiveClient: ClientSocketV2 | null): void {
        const activeKey = this.getActiveKey();
        if (activeKey !== this.lastActiveKey) {
            const entry = activeKey ? this.entries.get(activeKey) : undefined;
            logger.info('SOCKET', '[SocketManager] active moved', {
                data: {
                    from: this.lastActiveKey,
                    cid: activeKey,
                    kind: activeKey ? kindOf(activeKey) : null,
                    connectCount: entry?.connectCount ?? null,
                },
            });
            this.lastActiveKey = activeKey;
        }
        this.setState(this.computeState(this.getActiveEntry()));

        const activeClient = this.getActiveClient();
        if (activeClient === prevActiveClient) return;
        this.rebindTypeListeners(activeClient);
        for (const listener of this.clientListeners) {
            listener(activeClient);
        }
    }

    private bindEntry(key: SlotKey, entry: ClientEntry): void {
        const kind = kindOf(key);
        entry.unsubscribes.push(
            entry.client.onState((event: ClientSocketStateEvent) => {
                entry.connState = event.next;
                if (event.next !== 'connected') {
                    entry.authenticated = false;
                }
                if (event.next === 'connecting' && !entry.hasConnected) {
                    entry.hasConnected = true;
                    entry.firstConnectSince = Date.now();
                } else if (event.next !== 'connecting' && event.next !== 'connected') {
                    entry.firstConnectSince = undefined;
                }
                if (event.next === 'closing') {
                    entry.closingLocally = true;
                }
                if (event.next === 'connected') {
                    entry.lastClose = undefined;
                    entry.closingLocally = false;
                    entry.openedAt = perfNow();
                    entry.connectCount += 1;
                    if (entry.connectCount > 1) {
                        logger.info('SOCKET', '[SocketManager] reconnected', {
                            data: { kind, cid: key, connectCount: entry.connectCount },
                        });
                    }
                }
                this.notifySlotVerified(key);
                if (this.getActiveKey() === key) {
                    this.setState(this.computeState(entry));
                }
            })
        );

        entry.unsubscribes.push(
            entry.client.onError((event: ClientSocketErrorEvent) => {
                const fields = { error: event.error, data: { kind, cid: key, phase: event.phase } };

                if (event.phase === 'request') {
                    logger.warn('SOCKET', '[SocketManager] Socket error', fields);
                    return;
                }
                logger.error('SOCKET', '[SocketManager] Socket error', fields);
            })
        );

        entry.unsubscribes.push(entry.client.onMessage(event => entry.errorCodes.observe(event?.message)));

        this.bindReconnectDiagnostics(key, entry);
        this.bindCloseDiagnostics(key, entry);
    }

    private bindCloseDiagnostics(key: SlotKey, entry: ClientEntry): void {
        const transport = (entry.client as unknown as { transport?: TransportCloseSource }).transport;
        if (typeof transport?.on !== 'function') return;
        entry.unsubscribes.push(
            transport.on('close', event => {
                const local = entry.closingLocally;
                const cause = entry.tearingDown ? 'destroyed' : classifySocketClose(event, local);
                entry.lastClose = cause;
                entry.closingLocally = false;
                if (cause === 'service_restart' && local) this.reopenAfterRestart(key, entry);
                const openedAt = entry.openedAt;
                entry.openedAt = undefined;
                if (openedAt === undefined) return;
                logger.info('SOCKET', '[SocketManager] closed', {
                    data: {
                        kind: kindOf(key),
                        cid: key,
                        cause,
                        code: event?.code ?? null,
                        reason: event?.reason || null,
                        wasClean: event?.wasClean ?? null,
                        openForMs: Math.round(perfNow() - openedAt),
                    },
                });
            })
        );
    }

    private reopenAfterRestart(key: SlotKey, entry: ClientEntry): void {
        const { client } = entry;
        setTimeout(() => {
            if (entry.tearingDown || this.entries.get(key) !== entry || client.state !== 'closed') return;
            if (hasResumeKick(key)) return;
            const data = { kind: kindOf(key), cid: key };
            logger.info('SOCKET', '[SocketManager] reopening a socket the SDK restart left closed', { data });
            client.connect().catch(error => {
                logger.warn('SOCKET', '[SocketManager] reopen after restart failed', { error, data });
            });
        }, 0);
    }

    private bindReconnectDiagnostics(key: SlotKey, entry: ClientEntry): void {
        const kind = kindOf(key);
        const controller = entry.client.reconnect as
            | {
                  onConnectFailed?: (listener: (event: { attempt: number; error: unknown }) => void) => () => void;
                  onGiveUp?: (listener: (event: { attempts: number }) => void) => () => void;
              }
            | undefined;
        if (!controller) return;

        if (typeof controller.onConnectFailed === 'function') {
            entry.unsubscribes.push(
                controller.onConnectFailed(event => {
                    logger.warn('SOCKET', '[SocketManager] reconnect attempt failed', {
                        error: event.error,
                        data: { kind, cid: key, attempt: event.attempt },
                    });
                })
            );
        }

        if (typeof controller.onGiveUp === 'function') {
            entry.unsubscribes.push(
                controller.onGiveUp(event => {
                    logger.error('SOCKET', '[SocketManager] reconnect gave up', {
                        data: { kind, cid: key, attempts: event.attempts },
                    });
                })
            );
        }
    }

    private notifySlotVerified(key: SlotKey): void {
        for (const listener of this.slotVerifiedListeners) {
            listener(key);
        }
    }

    private teardownEntry(key: SlotKey): void {
        const entry = this.entries.get(key);
        if (!entry) return;
        const kind = kindOf(key);

        entry.tearingDown = true;
        entry.lastClose = 'destroyed';

        this.notifySlotClient(key, null);

        for (const unsubscribe of entry.unsubscribes) {
            try {
                unsubscribe();
            } catch (error) {
                logger.warn('SOCKET', '[SocketManager] Failed to unsubscribe socket listener', {
                    error,
                    data: { kind, cid: key },
                });
            }
        }
        try {
            entry.client.destroy();
        } catch (error) {
            logger.warn('SOCKET', '[SocketManager] Failed to destroy socket client', {
                error,
                data: { kind, cid: key },
            });
        }
        this.entries.delete(key);
        logger.info('SOCKET', '[SocketManager] slot torn down', {
            data: { cid: key, kind, connectCount: entry.connectCount },
        });
        socketFailureReporter.forget(key);
    }

    private setState(patch: Partial<SocketState>): void {
        const next = { ...this.state, ...patch };
        if (
            next.state === this.state.state &&
            next.isConnected === this.state.isConnected &&
            next.isVerified === this.state.isVerified &&
            next.connectionId === this.state.connectionId
        ) {
            return;
        }
        this.state = next;
        for (const listener of this.stateListeners) {
            listener(next);
        }
    }

    private requireActiveClient(action: string): ClientSocketV2 {
        const client = this.getActiveClient();
        if (!client) {
            throw new Error(`[SocketManager] Socket client not ready for ${action}`);
        }
        return client;
    }

    private notifySlotClient(key: SlotKey, client: ClientSocketV2 | null): void {
        for (const entry of this.slotTypeListeners) {
            if (entry.key === key) {
                this.bindSlotTypeListener(entry, client);
            }
        }
        for (const listener of this.slotClientListeners) {
            listener(key, client);
        }
    }

    private rebindTypeListeners(client: ClientSocketV2 | null): void {
        for (const entry of this.typeListeners) {
            entry.unsubscribe?.();
            entry.unsubscribe = undefined;
            this.bindTypeListener(entry, client);
        }
    }

    private bindSlotTypeListener(entry: SlotTypeListenerEntry, client: ClientSocketV2 | null): void {
        entry.unsubscribe?.();
        entry.unsubscribe = undefined;
        if (!client) return;
        entry.unsubscribe = client.onType(entry.type, entry.listener);
    }

    private bindTypeListener(entry: TypeListenerEntry, client: ClientSocketV2 | null): void {
        if (!client) {
            logger.debug('SOCKET', '[SocketManager] Skipping onType bind until an active socket exists', {
                type: entry.type,
            });
            return;
        }
        entry.unsubscribe = client.onType(entry.type, entry.listener);
    }

    private isSameConfig(left: SocketBindingConfig | null, right: SocketBindingConfig): boolean {
        return !!left && left.url === right.url && left.deviceId === right.deviceId && left.wssType === right.wssType;
    }

    private createClient(config: SocketBindingConfig): ClientSocketV2 {
        return createClientSocketV2({
            url: this.normalizeUrl(config.url),
            device: {
                id: config.deviceId,
                ...resolveSocketDevice(),
            },
            auth: AUTH_OPTIONS,
            socketFactory: context => transportPlatform.ports().createSocket(context),
        });
    }

    private normalizeUrl(url: string): string {
        try {
            const next = new URL(url);
            if (!next.searchParams.has('v2')) {
                next.searchParams.set('v2', '');
            }
            return next.toString();
        } catch {
            const separator = url.includes('?') ? '&' : '?';
            return url.includes('v2=') ? url : `${url}${separator}v2=`;
        }
    }
}
