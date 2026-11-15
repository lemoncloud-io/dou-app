import type { OnRuntimeEventPayload, RuntimeWireValue } from '@chatic/bridge-messages';
import { logger } from '@chatic/logger';

import { reviveRuntimeError } from '../errors';
import { RUNTIME_LISTENER_MARKER } from '../host';
import type { RuntimeMirrorPort } from './port';

/** A stream the mirror opened: what to do with each event, and with its end. */
interface OpenStream {
    name: string;
    lastSeq: number;
    ended: boolean;
    onEvent: (event: unknown) => void;
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
 * The mirror's side of the conversation: calls that resolve with what the member returned, and streams
 * whose events reach a handler until they are stopped or end.
 *
 * - **Calls** answer with the member's result, or throw the error a screen reads (`reviveRuntimeError`):
 *   the same fields whichever process ran it.
 * - **Streams** are routed by the id the mirror chose before it asked, so an event that arrives before
 *   the subscribe's answer is never dropped. Events at or below the last number seen for their id are
 *   late copies and are dropped. `{ $ended }` ends the stream, as does a refused subscribe; either is
 *   logged, since the screen that opened the stream has no other way to hear it.
 * - **Stopping** is synchronous for the caller. The unsubscribe goes out once the subscribe has been
 *   answered, so the other side never receives them in the wrong order.
 */
export const createMirrorConversation = (port: RuntimeMirrorPort) => {
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
     * for a listener stream is the listener's arguments as an array.
     */
    const open = (target: string, topic: string, args: readonly unknown[], onEvent: (event: unknown) => void) => {
        nextId += 1;
        const subscriptionId = `m${nextId}`;
        const stream: OpenStream = {
            name: `${target}.${topic}`,
            lastSeq: 0,
            ended: false,
            onEvent,
            stop: () => undefined,
        };
        streams.set(subscriptionId, stream);
        const answered = port.subscribe({ subscriptionId, target, topic, args: toWireArgs(args) }).then(
            () => true,
            failure => {
                if (!stream.ended) {
                    logger.warn('WEB_CORE', 'A mirrored stream was refused', {
                        error: reviveRuntimeError(failure as never),
                        data: { stream: stream.name },
                    });
                }
                stream.ended = true;
                streams.delete(subscriptionId);
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

    const dispose = () => {
        offEvent();
        [...streams.values()].forEach(stream => stream.stop());
    };

    return { call, send, open, listen, dispose };
};

export type MirrorConversation = ReturnType<typeof createMirrorConversation>;
