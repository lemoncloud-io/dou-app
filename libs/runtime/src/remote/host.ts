import type {
    AppMessageError,
    OnRuntimeCallPayload,
    OnRuntimeEventPayload,
    OnRuntimeHelloPayload,
    OnRuntimeSessionChangedPayload,
    RuntimeCallPayload,
    RuntimeHelloPayload,
    RuntimeSubscribePayload,
    RuntimeUnsubscribePayload,
    RuntimeWireValue,
} from '@chatic/bridge-messages';

import type { RuntimeEngine } from '../engine/engine';
import {
    CONNECTION_CALL_METHODS,
    CONNECTION_STREAMS,
    CONNECTION_TARGET,
    RUNTIME_CONTRACTS,
    SESSION_CHANGE_SIGNAL,
    SESSION_COMMAND_METHODS,
    SESSION_COMMANDS_TARGET,
    SESSION_LOGOUT_SIGNAL,
    SYNC_CALL_METHODS,
    SYNC_STREAMS,
    SYNC_TARGET,
    VIEW_STREAMS,
    answerRuntimeHello,
} from './contract';
import { runtimeNotAvailableFailure, toRuntimeFailure } from './errors';
import {
    DATA_CALL_METHODS,
    DATA_CLOUD_TARGET,
    DATA_STREAMS,
    DATA_TARGET,
    REPOSITORY_CALL_METHODS,
    REPOSITORY_RECEIPTS,
    REPOSITORY_STREAMS,
} from './repositories';

export const RUNTIME_LISTENER_MARKER = { $listener: true } as const;

export const RUNTIME_STARTING_CODE = 'RUNTIME_STARTING';
export const RUNTIME_CONTRACT_MISMATCH_CODE = 'RUNTIME_CONTRACT_MISMATCH';
export const RUNTIME_NOT_STARTED_CODE = 'RUNTIME_NOT_STARTED';
export const RUNTIME_PAYLOAD_TOO_LARGE_CODE = 'RUNTIME_PAYLOAD_TOO_LARGE';

export const DEFAULT_RUNTIME_PAYLOAD_LIMIT = 4 * 1024 * 1024;
export const DEFAULT_RUNTIME_HELLO_WAIT_MS = 5_000;

export interface RuntimePayloadSample {
    kind: 'hello' | 'call' | 'event' | 'session';
    name?: string;
    size: number;
}

export type RuntimeHostAnswer<T> = { value: T } | { failure: AppMessageError };

export interface RuntimeHostSend {
    event(payload: OnRuntimeEventPayload): void;
    sessionChanged(payload: OnRuntimeSessionChangedPayload): void;
}

export interface RuntimeBridgeHostOptions {
    engine: () => Promise<RuntimeEngine | null>;
    send: RuntimeHostSend;
    contracts?: readonly number[];
    helloWaitMs?: number;
    payloadLimit?: number;
    onPayload?: (sample: RuntimePayloadSample) => void;
    schedule?: (run: () => void) => void;
}

export interface RuntimeBridgeHost {
    hello(payload: RuntimeHelloPayload): Promise<RuntimeHostAnswer<OnRuntimeHelloPayload>>;
    call(payload: RuntimeCallPayload): Promise<RuntimeHostAnswer<OnRuntimeCallPayload>>;
    subscribe(payload: RuntimeSubscribePayload): Promise<RuntimeHostAnswer<Record<string, never>>>;
    unsubscribe(payload: RuntimeUnsubscribePayload): RuntimeHostAnswer<Record<string, never>>;
    dispose(): void;
}

type Invoke = (...args: unknown[]) => unknown;

const LISTENERLESS_STREAMS = new Set([`${SYNC_TARGET}.registerTarget`, `${DATA_TARGET}.holdCloud`]);

const isListenerMarker = (value: unknown): boolean =>
    typeof value === 'object' && value !== null && (value as { $listener?: unknown }).$listener === true;

const sizeOf = (value: unknown): number => JSON.stringify(value ?? null).length;

const has = (list: readonly string[], method: string): boolean => list.includes(method);

const repositoryMethod = (repositories: object, name: string): Invoke | null => {
    const dot = name.indexOf('.');
    const repository = (repositories as Record<string, Record<string, unknown> | undefined>)[name.slice(0, dot)];
    const member = repository?.[name.slice(dot + 1)];
    return typeof member === 'function' ? (member as Invoke).bind(repository) : null;
};

const viewOf = (
    engine: RuntimeEngine,
    target: string,
    topic: string
): { read: () => unknown; subscribe: (listener: () => void) => () => void } | null => {
    if (target === CONNECTION_TARGET && topic === VIEW_STREAMS[CONNECTION_TARGET]) {
        return {
            read: () => engine.connection.snapshot(),
            subscribe: listener => engine.connection.subscribe(listener),
        };
    }
    if (target === SYNC_TARGET && topic === VIEW_STREAMS[SYNC_TARGET]) {
        return {
            read: () => engine.sync.refusedChannels(),
            subscribe: listener => engine.sync.subscribeRefusedChannels(listener),
        };
    }
    return null;
};

const resolveMember = (
    engine: RuntimeEngine,
    kind: 'call' | 'stream' | 'receipt',
    target: string,
    method: string,
    args: unknown[]
): { invoke: Invoke; args: unknown[] } | null => {
    const listed = (calls: readonly string[], streams: readonly string[], receipts: readonly string[] = []) =>
        has(kind === 'call' ? calls : kind === 'stream' ? streams : receipts, method);
    const bound = (owner: object, name: string): Invoke | null => {
        const member = (owner as Record<string, unknown>)[name];
        return typeof member === 'function' ? (member as Invoke).bind(owner) : null;
    };
    let invoke: Invoke | null = null;
    let rest = args;
    switch (target) {
        case SESSION_COMMANDS_TARGET:
            if (kind === 'call' && has(SESSION_COMMAND_METHODS as readonly string[], method)) {
                invoke = bound(engine.commands, method);
            }
            break;
        case CONNECTION_TARGET:
            if (listed(CONNECTION_CALL_METHODS as readonly string[], CONNECTION_STREAMS as readonly string[])) {
                invoke = bound(engine.connection, method);
            }
            break;
        case SYNC_TARGET:
            if (listed(SYNC_CALL_METHODS as readonly string[], SYNC_STREAMS as readonly string[])) {
                invoke = bound(engine.sync, method);
            }
            break;
        case DATA_TARGET:
            if (listed(DATA_CALL_METHODS as readonly string[], DATA_STREAMS as readonly string[])) {
                invoke = bound(engine.data, method);
            } else if (listed(REPOSITORY_CALL_METHODS, REPOSITORY_STREAMS, REPOSITORY_RECEIPTS)) {
                invoke = repositoryMethod(engine.data.repositories(), method);
            }
            break;
        case DATA_CLOUD_TARGET:
            if (
                typeof args[0] === 'string' &&
                args[0] !== '' &&
                listed(REPOSITORY_CALL_METHODS, REPOSITORY_STREAMS, REPOSITORY_RECEIPTS)
            ) {
                invoke = repositoryMethod(engine.data.cloudRepositories(args[0]), method);
                rest = args.slice(1);
            }
            break;
    }
    return invoke ? { invoke, args: rest } : null;
};

export type RuntimeReceiptEvent = { written: RuntimeWireValue } | { delivered: true };

const receiptMember = (method: { invoke: Invoke; args: unknown[] }): { invoke: Invoke; args: unknown[] } => ({
    invoke: (listener: unknown, fail: unknown) => {
        const emit = listener as (event: RuntimeReceiptEvent) => void;
        const endWith = fail as (error: unknown) => void;
        let answered: Promise<unknown>;
        try {
            answered = Promise.resolve(method.invoke(...method.args));
        } catch (error) {
            answered = Promise.reject(error);
        }
        answered
            .then(receipt => {
                const { delivered, ...written } = (receipt ?? {}) as { delivered?: unknown };
                emit({ written: written as RuntimeWireValue });
                return Promise.resolve(delivered).then(() => emit({ delivered: true }));
            })
            .catch(endWith);
        return () => undefined;
    },
    args: [RUNTIME_LISTENER_MARKER],
});

export const createRuntimeBridgeHost = ({
    engine: startEngine,
    send,
    contracts = RUNTIME_CONTRACTS,
    helloWaitMs = DEFAULT_RUNTIME_HELLO_WAIT_MS,
    payloadLimit = DEFAULT_RUNTIME_PAYLOAD_LIMIT,
    onPayload,
    schedule = run => void Promise.resolve().then(run),
}: RuntimeBridgeHostOptions): RuntimeBridgeHost => {
    let engine: RuntimeEngine | null = null;
    let disposed = false;
    let sessionSeq = 0;
    let pushScheduled = false;
    let stopSessionPush: (() => void) | null = null;
    const subscriptions = new Map<string, () => void>();
    const lastEventSeq = new Map<string, number>();

    const tooLarge = (name: string, size: number): AppMessageError => ({
        code: RUNTIME_PAYLOAD_TOO_LARGE_CODE,
        message: `${name} answered ${size} characters, over the ${payloadLimit} the bridge carries`,
    });

    const snapshotOf = (live: RuntimeEngine) => ({ seq: sessionSeq, session: live.session.snapshot() });

    const pendingSignals = new Set<string>();

    const pushSession = () => {
        if (!pushScheduled) return;
        pushScheduled = false;
        if (!engine || disposed) return;
        sessionSeq += 1;
        const signals = [...pendingSignals];
        pendingSignals.clear();
        const payload: OnRuntimeSessionChangedPayload = {
            seq: sessionSeq,
            signals,
            session: engine.session.snapshot() as unknown as RuntimeWireValue,
        };
        onPayload?.({ kind: 'session', size: sizeOf(payload) });
        send.sessionChanged(payload);
    };

    const schedulePush = (signal: string) => {
        pendingSignals.add(signal);
        if (pushScheduled) return;
        pushScheduled = true;
        schedule(pushSession);
    };

    const startSessionPush = (live: RuntimeEngine) => {
        if (stopSessionPush) return;
        const offChange = live.session.subscribe(() => schedulePush(SESSION_CHANGE_SIGNAL));
        const offLogout = live.session.onLogout(() => schedulePush(SESSION_LOGOUT_SIGNAL));
        stopSessionPush = () => {
            offChange();
            offLogout();
        };
    };

    const endSubscriptions = () => {
        subscriptions.forEach(stop => stop());
        subscriptions.clear();
        lastEventSeq.clear();
    };

    const waitForEngine = async (): Promise<RuntimeEngine | null | 'starting'> => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const starting = new Promise<'starting'>(resolve => {
            timer = setTimeout(() => resolve('starting'), helloWaitMs);
        });
        try {
            return await Promise.race([startEngine(), starting]);
        } finally {
            if (timer !== undefined) clearTimeout(timer);
        }
    };

    const notStarted = (): { failure: AppMessageError } => ({
        failure: { code: RUNTIME_NOT_STARTED_CODE, message: 'the page has not been answered native yet' },
    });

    const subscribeTo = (
        subscriptionId: string,
        name: string,
        member: { invoke: Invoke; args: unknown[] },
        handFail = false
    ): RuntimeHostAnswer<Record<string, never>> => {
        subscriptions.get(subscriptionId)?.();
        let seq = lastEventSeq.get(subscriptionId) ?? 0;
        let ended = false;
        let stop: () => void = () => undefined;
        const end = () => {
            if (ended) return;
            ended = true;
            subscriptions.delete(subscriptionId);
            stop();
        };
        const listener = (...event: unknown[]) => {
            if (ended) return;
            seq += 1;
            lastEventSeq.set(subscriptionId, seq);
            let size: number;
            try {
                size = sizeOf(event);
            } catch (error) {
                send.event({ subscriptionId, seq, event: { $ended: toRuntimeFailure(error) } as never });
                end();
                return;
            }
            onPayload?.({ kind: 'event', name, size });
            if (size > payloadLimit) {
                send.event({ subscriptionId, seq, event: { $ended: tooLarge(name, size) } as never });
                end();
                return;
            }
            send.event({ subscriptionId, seq, event: event as RuntimeWireValue });
        };
        const fail = (error: unknown) => {
            if (ended) return;
            seq += 1;
            lastEventSeq.set(subscriptionId, seq);
            send.event({ subscriptionId, seq, event: { $ended: toRuntimeFailure(error) } as never });
            end();
        };

        const callArgs = member.args.map(arg => (isListenerMarker(arg) ? listener : arg));
        if (handFail) callArgs.push(fail);
        try {
            const returned = member.invoke(...callArgs);
            if (typeof returned !== 'function') {
                ended = true;
                return { failure: toRuntimeFailure(new Error(`${name} answered no way to stop it`)) };
            }
            stop = returned as () => void;
        } catch (error) {
            return { failure: toRuntimeFailure(error) };
        }
        if (ended) {
            stop();
            return { value: {} };
        }
        subscriptions.set(subscriptionId, end);
        return { value: {} };
    };

    return {
        hello: async payload => {
            let live: RuntimeEngine | null | 'starting';
            try {
                live = engine ?? (await waitForEngine());
            } catch (error) {
                return { failure: toRuntimeFailure(error) };
            }
            if (live === 'starting') {
                return { failure: { code: RUNTIME_STARTING_CODE, message: 'the runtime is still starting' } };
            }
            if (disposed) return { failure: { code: RUNTIME_NOT_STARTED_CODE, message: 'the bridge has closed' } };
            endSubscriptions();
            const answer = answerRuntimeHello(payload, {
                contracts,
                owns: live !== null,
                session: () => snapshotOf(live as RuntimeEngine),
            });
            if (answer.sessionOwner === 'web' && live) {
                return {
                    failure: {
                        code: RUNTIME_CONTRACT_MISMATCH_CODE,
                        message: 'the app holds the session under a contract this page does not speak',
                    },
                };
            }
            if (answer.sessionOwner === 'native' && live) {
                engine = live;
                startSessionPush(live);
            }
            onPayload?.({ kind: 'hello', size: sizeOf(answer) });
            return { value: answer };
        },

        call: async ({ target, method, args }) => {
            if (disposed) return { failure: { code: RUNTIME_NOT_STARTED_CODE, message: 'the bridge has closed' } };
            if (!engine) return notStarted();
            const member = resolveMember(engine, 'call', target, method, Array.isArray(args) ? args : []);
            if (!member) return { failure: runtimeNotAvailableFailure(target, method) };
            let value: unknown;
            try {
                value = await member.invoke(...member.args);
            } catch (error) {
                pushSession();
                return { failure: toRuntimeFailure(error) };
            }
            pushSession();
            const name = `${target}.${method}`;
            let size: number;
            try {
                size = sizeOf(value);
            } catch (error) {
                return { failure: toRuntimeFailure(error) };
            }
            onPayload?.({ kind: 'call', name, size });
            if (size > payloadLimit) return { failure: tooLarge(name, size) };
            return { value: { value: (value === undefined ? null : value) as RuntimeWireValue } };
        },

        subscribe: async ({ subscriptionId, target, topic, args }) => {
            if (!engine) return notStarted();
            const given = Array.isArray(args) ? args : [];
            const view = viewOf(engine, target, topic);
            if (view) {
                const viewArgs = [RUNTIME_LISTENER_MARKER];
                let scheduled = false;
                const viewMember = {
                    invoke: (listener: unknown, fail: unknown) => {
                        const emit = listener as (value: unknown) => void;
                        const endWith = fail as (error: unknown) => void;
                        const push = () => {
                            if (scheduled) return;
                            scheduled = true;
                            schedule(() => {
                                scheduled = false;
                                let value: unknown;
                                try {
                                    value = view.read();
                                } catch (error) {
                                    endWith(error);
                                    return;
                                }
                                emit(value);
                            });
                        };
                        push();
                        return view.subscribe(push);
                    },
                    args: viewArgs,
                };
                return subscribeTo(subscriptionId, `${target}.${topic}`, viewMember, true);
            }
            const receipt = resolveMember(engine, 'receipt', target, topic, given);
            if (receipt) return subscribeTo(subscriptionId, `${target}.${topic}`, receiptMember(receipt), true);

            const member = resolveMember(engine, 'stream', target, topic, given);
            if (!member) return { failure: runtimeNotAvailableFailure(target, topic) };

            const markers = member.args.filter(isListenerMarker).length;
            if (markers !== (LISTENERLESS_STREAMS.has(`${target}.${topic}`) ? 0 : 1)) {
                return {
                    failure: toRuntimeFailure(
                        new Error(
                            `${target}.${topic} takes ${markers === 0 ? 'a' : 'one'} listener marker in its arguments`
                        )
                    ),
                };
            }

            return subscribeTo(subscriptionId, `${target}.${topic}`, member);
        },

        unsubscribe: ({ subscriptionId }) => {
            subscriptions.get(subscriptionId)?.();
            return { value: {} };
        },

        dispose: () => {
            disposed = true;
            endSubscriptions();
            stopSessionPush?.();
            stopSessionPush = null;
        },
    };
};
