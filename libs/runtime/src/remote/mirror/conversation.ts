import type { OnRuntimeEventPayload, RuntimeWireValue } from '@chatic/bridge-messages';
import { logger } from '@chatic/logger';

import { RUNTIME_NOT_AVAILABLE_CODE, reviveRuntimeError } from '../errors';
import { RUNTIME_LISTENER_MARKER } from '../host';
import type { RuntimeReceiptEvent } from '../host';
import type { RuntimeMirrorPort } from './port';

type StreamEnd = 'ended' | 'refused';

interface OpenStream {
    name: string;
    lastSeq: number;
    ended: boolean;
    onEvent: (event: unknown) => void;
    onEnd?: (failure: unknown, how: StreamEnd) => void;
    stop: () => void;
}

export const toWireArgs = (args: readonly unknown[]): RuntimeWireValue[] => {
    let end = args.length;
    while (end > 0 && args[end - 1] === undefined) end -= 1;
    return args.slice(0, end).map(arg => (arg === undefined ? null : arg)) as RuntimeWireValue[];
};

const endedFailure = (event: unknown): unknown =>
    typeof event === 'object' && event !== null && '$ended' in event
        ? (event as { $ended: unknown }).$ended
        : undefined;

export const RECEIPT_WRITTEN_TIMEOUT_MS = 60_000;

export interface MirrorConversationOptions {
    receiptWrittenTimeoutMs?: number;
}

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
        return reply?.value as T;
    };

    const send = (target: string, method: string, args: readonly unknown[] = []): void => {
        void call(target, method, args).catch(error =>
            logger.warn('WEB_CORE', 'A mirrored call failed', { error, data: { call: `${target}.${method}` } })
        );
    };

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

    const streamlessReceipts = new Set<string>();

    const receiptWithoutDelivery = <T extends object>(
        target: string,
        method: string,
        args: readonly unknown[]
    ): Promise<T & { delivered: Promise<void> }> =>
        call<object | null>(target, method, args).then(answer => {
            const rest: Record<string, unknown> = { ...(answer ?? {}) };
            delete rest.delivered;
            return { ...rest, delivered: Promise.resolve() } as T & { delivered: Promise<void> };
        });

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
