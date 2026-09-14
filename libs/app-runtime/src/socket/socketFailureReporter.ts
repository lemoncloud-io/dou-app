import { logger, type ObservationData } from '@chatic/bridges';

import { getSocketErrorCode } from './utils/socketErrorCode';

import type { SocketKind } from './types';

/**
 * What kind of failure a rejected socket request was.
 *
 * The split exists because the three call for different volumes, not because the codes are
 * interesting in themselves. `unavailable` arrives in bursts and says nothing new per occurrence;
 * `server` is one decision the server made about one request and is the entry worth having.
 */
export type SocketFailureClass = 'unavailable' | 'timeout' | 'server';

const classify = (code: number | undefined): SocketFailureClass => {
    // 503 is raised per send attempt while the transport is down; 499 rejects every in-flight AND
    // queued request at once when the socket closes or the client is destroyed. Both mean "there is
    // no socket", which the connection-level triggers already report far better than a request can.
    if (code === 503 || code === 499) return 'unavailable';
    if (code === 408) return 'timeout';
    return 'server';
};

/**
 * Reports failed socket requests — the class of failure that had no trigger at all.
 *
 * **Why this exists.** The catalog's "socket error" row is about the SDK's `onError`, and a server's
 * `*:error` frame never reaches it: `PendingRequestStore.settle` rejects the pending promise and
 * calls no emitter. So a rejection travelled out through `SocketManager`'s facade, got its caller
 * name appended, and was rethrown — with no entry anywhere. Whether anything was recorded depended
 * on the caller: a react-query path was caught by the query cache (as `GLOBAL` `[query] …`, which
 * does not read as a socket failure and is indistinguishable from an HTTP one), and everything else
 * — sync polls, imperative repository calls, fire-and-forget writes — left no trace.
 *
 * The facade is the choke point, which is why the reporting lives here and not at call sites. Every
 * socket request in the app goes through it, so a new one cannot forget.
 *
 * **Volume is the whole design problem.** A request-level trigger is exactly what the catalog
 * forbids per frame, and for good reason: while the socket is down, every registered sync target
 * fails on every poll. So the failures that mean "no socket" are counted and reported as a streak —
 * first failure `warn`, the threshold `error`, recovery `info`, silence in between — and only the
 * failures the server actually answered get an entry of their own. A healthy device produces
 * nothing.
 *
 * **What is not recorded.** No request payload and no response body. The status and the request type
 * are the diagnosis; the arguments are where the personal data is.
 */
export interface ISocketFailureReporter {
    /**
     * Records one failed request. Logs individually for a server-answered failure, and folds
     * connection-absence failures into a streak.
     */
    recordFailure(kind: SocketKind, action: string, type: string, error: unknown): void;
    /** Records a request that succeeded — logs only when it ends a streak. */
    recordSuccess(kind: SocketKind): void;
    /** Drops every streak. Tests only. */
    reset(): void;
}

class SocketFailureReporter implements ISocketFailureReporter {
    /**
     * Consecutive connection-absence failures before the slot is called stuck.
     *
     * A count rather than a duration, because the cadence belongs to whatever is retrying. It is
     * deliberately low: these only accumulate while the socket is down, and the connection-level
     * triggers (`reconnect attempt failed`, `reconnect gave up`) are the better account of *why* —
     * this one's job is to say that requests are being lost meanwhile, once.
     *
     * Unvalidated until the first field data, like the other two thresholds in this track.
     */
    private static readonly STUCK_THRESHOLD = 5;

    /** Consecutive unavailable-class failures per slot. */
    private readonly streaks = new Map<SocketKind, number>();

    recordFailure(kind: SocketKind, action: string, type: string, error: unknown): void {
        const code = getSocketErrorCode(error);
        const failure = classify(code);

        if (failure === 'unavailable') {
            this.recordUnavailable(kind, type, code, error);
            return;
        }

        // A request that reached the server resets the streak whatever its verdict: a 403 proves the
        // socket is up, so counting it as "still down" would keep the streak alive forever.
        this.streaks.set(kind, 0);

        if (failure === 'timeout') {
            // Distinct from a refusal: the request was accepted and never answered. `warn` because
            // the caller may well retry into a working socket, and because a wedged server produces
            // these in numbers a second `error` source would not survive.
            logger.warn('SOCKET', `socket request timed out — ${kind}.${action}(${type})`, {
                error,
                data: { kind, action, type, code },
            });
            return;
        }

        logger.error('SOCKET', `${code ?? 'unclassified'} socket request failed — ${kind}.${action}(${type})`, {
            error,
            data: { kind, action, type, code },
        });
    }

    recordSuccess(kind: SocketKind): void {
        const streak = this.streaks.get(kind) ?? 0;
        if (streak === 0) return;

        this.streaks.set(kind, 0);
        logger.info('SOCKET', `socket requests recovered — ${kind}`, {
            data: {
                observation: 'socket-unavailable-streak',
                kind,
                afterFailures: streak,
            } satisfies ObservationData,
        });
    }

    reset(): void {
        this.streaks.clear();
    }

    private recordUnavailable(kind: SocketKind, type: string, code: number | undefined, error: unknown): void {
        const next = (this.streaks.get(kind) ?? 0) + 1;
        this.streaks.set(kind, next);

        const data = {
            observation: 'socket-unavailable-streak',
            kind,
            // The first request to fail is the one worth naming; past that the type is whichever
            // poll happened to land, so the streak count is the fact and the type is noise.
            type,
            code,
            streak: next,
        } satisfies ObservationData;

        if (next === 1) {
            logger.warn('SOCKET', `socket request lost — no ${kind} connection`, { error, data });
            return;
        }

        if (next === SocketFailureReporter.STUCK_THRESHOLD) {
            logger.error('SOCKET', `${next} socket requests lost — ${kind} connection is not coming back`, {
                error,
                data,
            });
        }

        // Past the threshold there is nothing new to say until it recovers.
    }
}

export const socketFailureReporter: ISocketFailureReporter = new SocketFailureReporter();
