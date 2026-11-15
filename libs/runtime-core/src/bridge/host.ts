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

import type { RuntimeEngine } from '../engine';
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
    REPOSITORY_STREAMS,
} from './repositories';

/**
 * The marker a page puts in a `RuntimeSubscribe`'s `args` where the member takes its listener — the
 * callback of an `observe*` method, `onServerEvent`'s listener, an observer. The host puts its own
 * listener there, and what that listener is called with becomes one `OnRuntimeEvent` (its arguments,
 * as an array). A stream with no listener (`registerTarget`, `holdCloud`) has no marker: it stands while
 * subscribed.
 */
export const RUNTIME_LISTENER_MARKER = { $listener: true } as const;

/** The `code` a hello answers with while the runtime is still starting: the page asks again. */
export const RUNTIME_STARTING_CODE = 'RUNTIME_STARTING';
/**
 * The `code` a hello answers with when the shell already holds the session for this launch but the page
 * shares no contract with it — a page newer than the installed app by a contract. The page must not
 * take the session (the shell keeps running it), so it is not told `web`; it is told it cannot mirror
 * this app.
 */
export const RUNTIME_CONTRACT_MISMATCH_CODE = 'RUNTIME_CONTRACT_MISMATCH';
/** The `code` a call or subscription answers with before a hello was answered `native`. */
export const RUNTIME_NOT_STARTED_CODE = 'RUNTIME_NOT_STARTED';
/**
 * The `code` for a result or an event larger than the host sends. A subscription whose event is too
 * large ends with `{ $ended: failure }` as its last event, so the page knows it stopped hearing.
 */
export const RUNTIME_PAYLOAD_TOO_LARGE_CODE = 'RUNTIME_PAYLOAD_TOO_LARGE';

/** The largest body the host sends, in UTF-16 code units of its JSON — a safety cap, not a budget. */
export const DEFAULT_RUNTIME_PAYLOAD_LIMIT = 4 * 1024 * 1024;
/** How long a hello waits for the runtime to start before answering `RUNTIME_STARTING`. */
export const DEFAULT_RUNTIME_HELLO_WAIT_MS = 5_000;

/** What crossed, and how big it was — for the shell's own measurements. */
export interface RuntimePayloadSample {
    kind: 'hello' | 'call' | 'event' | 'session';
    /** `<target>.<method>` for a call, the stream's for an event. */
    name?: string;
    /** UTF-16 code units of the body's JSON. */
    size: number;
}

/** A host answer: the payload to reply with, or the failure to reply with. */
export type RuntimeHostAnswer<T> = { value: T } | { failure: AppMessageError };

/** The pushes the host sends the page on its own. */
export interface RuntimeHostSend {
    event(payload: OnRuntimeEventPayload): void;
    sessionChanged(payload: OnRuntimeSessionChangedPayload): void;
}

export interface RuntimeBridgeHostOptions {
    /**
     * The runtime, started on first ask, or `null` when this process does not run the session this
     * launch. Called on each hello; it has to answer the same engine every time.
     */
    engine: () => Promise<RuntimeEngine | null>;
    send: RuntimeHostSend;
    /** The contract versions this build speaks. */
    contracts?: readonly number[];
    helloWaitMs?: number;
    payloadLimit?: number;
    /** Hears every body's size; the host itself logs nothing. */
    onPayload?: (sample: RuntimePayloadSample) => void;
    /** When the session push runs after a change; a microtask by default, so one turn's changes push once. */
    schedule?: (run: () => void) => void;
}

export interface RuntimeBridgeHost {
    hello(payload: RuntimeHelloPayload): Promise<RuntimeHostAnswer<OnRuntimeHelloPayload>>;
    call(payload: RuntimeCallPayload): Promise<RuntimeHostAnswer<OnRuntimeCallPayload>>;
    subscribe(payload: RuntimeSubscribePayload): Promise<RuntimeHostAnswer<Record<string, never>>>;
    unsubscribe(payload: RuntimeUnsubscribePayload): RuntimeHostAnswer<Record<string, never>>;
    /** Ends every subscription and the session push. */
    dispose(): void;
}

type Invoke = (...args: unknown[]) => unknown;

/** The streams that take no listener: they stand while subscribed and send no events. */
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

/** A view a page mirrors through a subscription (`VIEW_STREAMS`): its value now, and its changes. */
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

/**
 * The member a `RuntimeCall` or `RuntimeSubscribe` names, bound and with the arguments it takes — or
 * `null` when the contract does not list it for that kind. Only listed members are reached: a page names
 * them by string, and nothing outside the contract is callable however it is spelled.
 */
const resolveMember = (
    engine: RuntimeEngine,
    kind: 'call' | 'stream',
    target: string,
    method: string,
    args: unknown[]
): { invoke: Invoke; args: unknown[] } | null => {
    const listed = (calls: readonly string[], streams: readonly string[]) =>
        has(kind === 'call' ? calls : streams, method);
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
            } else if (listed(REPOSITORY_CALL_METHODS, REPOSITORY_STREAMS)) {
                invoke = repositoryMethod(engine.data.repositories(), method);
            }
            break;
        case DATA_CLOUD_TARGET:
            // A cloud's graph rather than the live scope's: the cloud id comes first.
            if (typeof args[0] === 'string' && args[0] !== '' && listed(REPOSITORY_CALL_METHODS, REPOSITORY_STREAMS)) {
                invoke = repositoryMethod(engine.data.cloudRepositories(args[0]), method);
                rest = args.slice(1);
            }
            break;
    }
    return invoke ? { invoke, args: rest } : null;
};

/**
 * The shell's half of the runtime across the bridge: it answers a page's hello, runs the calls the
 * contract lists, keeps the page's subscriptions and pushes the session as it changes. It is the same
 * for every shell — the shell supplies the engine and the way to send, and wires the four requests to
 * it — so this half is plain logic, testable without a WebView.
 *
 * - **Hello.** Waits for the engine (`helloWaitMs`), then answers with `answerRuntimeHello`. A runtime
 *   still starting answers `RUNTIME_STARTING`, which a page reads as "no answer" and asks again. A hello
 *   is a new document saying it is there, so the previous document's subscriptions end.
 * - **Calls.** Only members the contract lists, by target. Anything else answers
 *   `RUNTIME_NOT_AVAILABLE`; a member that throws answers `RUNTIME_ERROR` with the crossing fields.
 * - **Subscriptions.** The listener goes where the page put `RUNTIME_LISTENER_MARKER`; each call of it
 *   is one `OnRuntimeEvent`, numbered per subscription. A new subscription under a known id replaces
 *   the old one.
 * - **The session.** Every change of the session view, coalesced per `schedule`, is one
 *   `OnRuntimeSessionChanged` with the next number; the hello's answer carries the number it is at. A
 *   push still waiting when a call settles goes out before the call's answer.
 * - **Size.** A result or event larger than `payloadLimit` is not sent: the call fails, and the
 *   subscription ends with `{ $ended: failure }`. Every body's size goes to `onPayload`. The size is the
 *   length of the body's JSON — an approximation of what crosses, which adds the envelope and its
 *   encoding; a hello's answer and a session push are measured but never refused.
 */
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
    // The last event number under each subscription id, kept across a replacement under the same id:
    // an event of the old stream still in flight then never numbers above the new stream's first.
    const lastEventSeq = new Map<string, number>();

    const tooLarge = (name: string, size: number): AppMessageError => ({
        code: RUNTIME_PAYLOAD_TOO_LARGE_CODE,
        message: `${name} answered ${size} characters, over the ${payloadLimit} the bridge carries`,
    });

    const snapshotOf = (live: RuntimeEngine) => ({ seq: sessionSeq, session: live.session.snapshot() });

    // What happened since the last push: a change of the view, a sign-out, or both.
    const pendingSignals = new Set<string>();

    // Runs from the schedule, or sooner from a call's answer (`flushSessionPush`); whichever comes
    // first sends the push and the other finds nothing due.
    const pushSession = () => {
        if (!pushScheduled) return;
        pushScheduled = false;
        // A call still running when the bridge closed settles after it: no one is there to push to.
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
        // A sign-out is a moment, not a state: the snapshot after it may look like the one before.
        const offLogout = live.session.onLogout(() => schedulePush(SESSION_LOGOUT_SIGNAL));
        stopSessionPush = () => {
            offChange();
            offLogout();
        };
    };

    const endSubscriptions = () => {
        subscriptions.forEach(stop => stop());
        subscriptions.clear();
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

    /**
     * Opens a stream under `subscriptionId`. The member is invoked with the host's listener where its
     * arguments hold the marker; a member that has to end its stream on its own (a view whose read
     * failed) is handed `fail` as its last argument.
     */
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
                // A stream that cannot be stopped would outlive the page that asked for it.
                ended = true;
                return { failure: toRuntimeFailure(new Error(`${name} answered no way to stop it`)) };
            }
            stop = returned as () => void;
        } catch (error) {
            return { failure: toRuntimeFailure(error) };
        }
        // An event during the subscribing call itself may already have ended it.
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
            // A hello is a new document, whatever it is answered: what the last one subscribed to is
            // no one's now.
            endSubscriptions();
            const answer = answerRuntimeHello(payload, {
                contracts,
                owns: live !== null,
                session: () => snapshotOf(live as RuntimeEngine),
            });
            if (answer.sessionOwner === 'web' && engine) {
                // Once a page was answered `native`, the shell runs the session for the rest of the
                // process: a later page that shares no contract must not take it as well.
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
            // What the call did to the session goes out before its answer, so a page whose command
            // resolves already holds the snapshot that shows it.
            pushSession();
            const name = `${target}.${method}`;
            let size: number;
            try {
                size = sizeOf(value);
            } catch (error) {
                // A result that is not JSON (a cycle, a BigInt) cannot cross.
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
                // A view: its current value at once, then each change, coalesced per turn.
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
                                    // A read that throws ends the mirror, saying so, rather than leaving
                                    // the page on a value that silently stopped changing.
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
            const member = resolveMember(engine, 'stream', target, topic, given);
            if (!member) return { failure: runtimeNotAvailableFailure(target, topic) };

            // Exactly one listener where the member takes one, none where it takes none (`registerTarget`,
            // `holdCloud`, which stand while subscribed): a stream run without its listener would fail at its
            // first emission, inside the runtime rather than in front of the page.
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
