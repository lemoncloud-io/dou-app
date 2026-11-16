import type { OnRuntimeEventPayload, RuntimeWireValue } from '@chatic/bridge-messages';
import { logger } from '@chatic/logger';

import { RUNTIME_NOT_AVAILABLE_CODE, reviveRuntimeError } from '../errors';
import { RUNTIME_LISTENER_MARKER } from '../host';
import type { RuntimeReceiptEvent } from '../host';
import type { RuntimeMirrorPort } from './port';

/**
 * How a stream ended from the other side: `ended` by its last event (`{ $ended: failure }`), or
 * `refused` — its subscribe answered with a failure.
 */
type StreamEnd = 'ended' | 'refused';

/** A stream the mirror opened: what to do with each event, and with its end. */
interface OpenStream {
    name: string;
    lastSeq: number;
    ended: boolean;
    onEvent: (event: unknown) => void;
    /** Hears the end, when the opener asked to; otherwise the end is logged. */
    onEnd?: (failure: unknown, how: StreamEnd) => void;
    stop: () => void;
}

/**
 * Arguments as they cross: JSON has no `undefined`, so a trailing one is dropped — the member then sees
 * its own default, as it would have in-process — and one in the middle crosses as `null`.
 */
export const toWireArgs = (args: readonly unknown[]): RuntimeWireValue[] => {
    let end = args.length;
    while (end > 0 && args[end - 1] === undefined) end -= 1;
    return args.slice(0, end).map(arg => (arg === undefined ? null : arg)) as RuntimeWireValue[];
};

const endedFailure = (event: unknown): unknown =>
    typeof event === 'object' && event !== null && '$ended' in event
        ? (event as { $ended: unknown }).$ended
        : undefined;

/**
 * How long a write receipt waits for the shell to report the write made locally — the bridge's own call
 * timeout for a runtime request (`@chatic/runtime-web`'s `RUNTIME_CALL_TIMEOUT_MS`), which bounded these
 * writes when they crossed as calls. It only catches a report that never comes: the local write takes
 * milliseconds.
 */
export const RECEIPT_WRITTEN_TIMEOUT_MS = 60_000;

export interface MirrorConversationOptions {
    /** How long a write receipt waits for `{ written }`; `RECEIPT_WRITTEN_TIMEOUT_MS` by default. */
    receiptWrittenTimeoutMs?: number;
}

/**
 * The mirror's side of the conversation: calls that resolve with what the member returned, and streams
 * whose events reach a handler until they are stopped or end.
 *
 * - **Calls** answer with the member's result, or throw the error a screen reads (`reviveRuntimeError`):
 *   the same fields whichever process ran it.
 * - **Streams** are routed by the id the mirror chose before it asked, so an event that arrives before
 *   the subscribe's answer is never dropped. Events at or below the last number seen for their id are
 *   late copies and are dropped. `{ $ended }` ends the stream, as does a refused subscribe. The end goes
 *   to the opener when it asked to hear it (a write receipt, which hands it to the screen as a rejection)
 *   and is logged otherwise, since the screen that opened the stream has no other way to hear it.
 * - **Stopping** is synchronous for the caller. The unsubscribe goes out once the subscribe has been
 *   answered, so the other side never receives them in the wrong order. Stopping, and `dispose`, end a
 *   stream without telling its opener: a write receipt still waiting when the mirror is disposed never
 *   settles, which no page notices, since only a test disposes a mirror its page still uses.
 */
export const createMirrorConversation = (
    port: RuntimeMirrorPort,
    { receiptWrittenTimeoutMs = RECEIPT_WRITTEN_TIMEOUT_MS }: MirrorConversationOptions = {}
) => {
    let nextId = 0;
    const streams = new Map<string, OpenStream>();

    const route = ({ subscriptionId, seq, event }: OnRuntimeEventPayload) => {
        const stream = streams.get(subscriptionId);
        if (!stream || stream.ended) return;
        if (typeof seq === 'number') {
            if (seq <= stream.lastSeq) return;
            if (seq > stream.lastSeq + 1) {
                logger.warn('WEB_CORE', 'A mirrored stream skipped events', {
                    data: { stream: stream.name, from: stream.lastSeq, to: seq },
                });
            }
            stream.lastSeq = seq;
        }
        const failure = endedFailure(event);
        if (failure !== undefined) {
            stream.ended = true;
            streams.delete(subscriptionId);
            if (stream.onEnd) {
                stream.onEnd(failure, 'ended');
                return;
            }
            logger.warn('WEB_CORE', 'A mirrored stream ended', {
                error: reviveRuntimeError(failure as never),
                data: { stream: stream.name },
            });
            return;
        }
        try {
            stream.onEvent(event);
        } catch (error) {
            logger.error('WEB_CORE', 'A mirrored stream listener threw', { error, data: { stream: stream.name } });
        }
    };
    const offEvent = port.onEvent(route);

    const call = async <T = unknown>(target: string, method: string, args: readonly unknown[] = []): Promise<T> => {
        let reply;
        try {
            reply = await port.call({ target, method, args: toWireArgs(args) });
        } catch (failure) {
            throw reviveRuntimeError(failure as never);
        }
        // `null` stays `null`: the member's own `undefined` already crossed as it (JSON has no other).
        return reply?.value as T;
    };

    /** A call whose caller does not wait for it (a `void` member): a failure is logged, not thrown. */
    const send = (target: string, method: string, args: readonly unknown[] = []): void => {
        void call(target, method, args).catch(error =>
            logger.warn('WEB_CORE', 'A mirrored call failed', { error, data: { call: `${target}.${method}` } })
        );
    };

    /**
     * Opens a stream. `args` holds the member's arguments with `RUNTIME_LISTENER_MARKER` where it takes
     * its listener (or none, for a stream that only stands while open); `onEvent` hears each event, which
     * for a listener stream is the listener's arguments as an array. `onEnd`, when given, hears the end
     * from the other side — the failure as it crossed — instead of the end being logged.
     */
    const open = (
        target: string,
        topic: string,
        args: readonly unknown[],
        onEvent: (event: unknown) => void,
        onEnd?: (failure: unknown, how: StreamEnd) => void
    ) => {
        nextId += 1;
        const subscriptionId = `m${nextId}`;
        const stream: OpenStream = {
            name: `${target}.${topic}`,
            lastSeq: 0,
            ended: false,
            onEvent,
            onEnd,
            stop: () => undefined,
        };
        streams.set(subscriptionId, stream);
        const answered = port.subscribe({ subscriptionId, target, topic, args: toWireArgs(args) }).then(
            () => true,
            failure => {
                const heard = !stream.ended;
                stream.ended = true;
                streams.delete(subscriptionId);
                if (heard && onEnd) {
                    onEnd(failure, 'refused');
                } else if (heard) {
                    logger.warn('WEB_CORE', 'A mirrored stream was refused', {
                        error: reviveRuntimeError(failure as never),
                        data: { stream: stream.name },
                    });
                }
                return false;
            }
        );
        const stop = () => {
            // Ended from the other side (`$ended`, a refusal): there is nothing left to unsubscribe.
            if (stream.ended) return;
            stream.ended = true;
            streams.delete(subscriptionId);
            void answered.then(open => {
                if (open) void port.unsubscribe({ subscriptionId }).catch(() => undefined);
            });
        };
        stream.stop = stop;
        return stop;
    };

    /**
     * A listener stream: the listener goes where `listenerAt` is in `args`, and hears each event's
     * arguments spread back out.
     */
    const listen = (
        target: string,
        topic: string,
        args: readonly unknown[],
        listenerAt: number,
        listener: (...event: never[]) => void
    ): (() => void) => {
        const wire = [...args];
        wire[listenerAt] = RUNTIME_LISTENER_MARKER;
        return open(target, topic, wire, event =>
            (listener as (...event: unknown[]) => void)(...(Array.isArray(event) ? event : [event]))
        );
    };

    // The receipt methods an app refused to stream (it predates them): asked as plain calls from then on,
    // so each later write costs one round trip rather than a refused subscribe and then a call. Kept by
    // method name alone — an app either streams receipts or does not, whichever graph the write is in.
    const streamlessReceipts = new Set<string>();

    /** A receipt method called as it was before receipts streamed: the write is made, its delivery unheard. */
    const receiptWithoutDelivery = <T extends object>(
        target: string,
        method: string,
        args: readonly unknown[]
    ): Promise<T & { delivered: Promise<void> }> =>
        call<object | null>(target, method, args).then(answer => {
            // JSON emptied it to `{}`: what is left of it is no promise.
            const rest: Record<string, unknown> = { ...(answer ?? {}) };
            delete rest.delivered;
            return { ...rest, delivered: Promise.resolve() } as T & { delivered: Promise<void> };
        });

    /**
     * Calls a repository method that answers with a write receipt, and answers with the receipt as it is
     * in-process: once the local half is done, with a `delivered` promise that settles when the server
     * has the write — or rejects with the refusal. The method crosses as a stream (`receiptMember` in the
     * host), since a promise in the result would arrive as `{}`.
     *
     * - **The local half is bounded** by `receiptWrittenTimeoutMs`, as a call is by the bridge's own
     *   timeout: a write the shell never reports made rejects with the 408 a call that timed out reads as.
     *   The server's half is not bounded — it waits for the socket for as long as the outbox does.
     * - **An app from before receipts crossed this way** refuses the stream (`RUNTIME_NOT_AVAILABLE`); the
     *   method is then called as it was, and `delivered` resolves at once — the write is made and goes out
     *   as before, but a refusal of it is not heard on the page, and nothing that waits on `delivered`
     *   waits for the server. The refusal is remembered (`streamlessReceipts`), and logged once.
     */
    const receipt = <T extends object>(
        target: string,
        method: string,
        args: readonly unknown[] = []
    ): Promise<T & { delivered: Promise<void> }> => {
        if (streamlessReceipts.has(method)) return receiptWithoutDelivery<T>(target, method, args);
        return new Promise((resolveWritten, rejectWritten) => {
            let written = false;
            let settle!: { resolve: () => void; reject: (error: Error) => void };
            const delivered = new Promise<void>((resolve, reject) => {
                settle = { resolve, reject };
            });
            // As the outbox's own promise: a refusal no one waits for is not an unhandled rejection.
            delivered.catch(() => undefined);

            const timer = setTimeout(() => {
                if (written) return;
                stop();
                rejectWritten(
                    reviveRuntimeError({
                        code: 'TIMEOUT',
                        message: `${target}.${method} was not written within ${receiptWrittenTimeoutMs}ms`,
                    })
                );
            }, receiptWrittenTimeoutMs);

            const stop = open(
                target,
                method,
                args,
                event => {
                    const [step] = event as [RuntimeReceiptEvent];
                    if (step && 'written' in step && !written) {
                        written = true;
                        clearTimeout(timer);
                        resolveWritten({ ...(step.written as object), delivered } as T & {
                            delivered: Promise<void>;
                        });
                    } else if (step && 'delivered' in step) {
                        settle.resolve();
                        stop();
                    }
                },
                (failure, how) => {
                    clearTimeout(timer);
                    const code = (failure as { code?: unknown } | null | undefined)?.code;
                    if (how === 'refused' && code === RUNTIME_NOT_AVAILABLE_CODE) {
                        if (!streamlessReceipts.has(method)) {
                            streamlessReceipts.add(method);
                            logger.info('WEB_CORE', 'The app answers this write without its delivery', {
                                data: { call: `${target}.${method}` },
                            });
                        }
                        receiptWithoutDelivery<T>(target, method, args).then(resolveWritten, rejectWritten);
                        return;
                    }
                    const error = reviveRuntimeError(failure as never);
                    if (written) settle.reject(error);
                    else rejectWritten(error);
                }
            );
        });
    };

    const dispose = () => {
        offEvent();
        [...streams.values()].forEach(stream => stream.stop());
    };

    return { call, send, open, listen, receipt, dispose };
};

export type MirrorConversation = ReturnType<typeof createMirrorConversation>;
