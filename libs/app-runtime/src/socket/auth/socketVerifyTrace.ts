import { isPageHidden, pageHideCount, perfNow, recordPerfSample } from '@chatic/perf';

import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import type { SlotKey } from '../types';
import { kindOf } from '../utils/slotKey';

/**
 * At most this many `socket_verify` samples per minute, across every slot.
 *
 * A socket the server keeps dropping reconnects on its own, without limit, and each attempt would be
 * a sample. Every trace a device records shares one Firebase Performance budget (300 per ten minutes
 * in the foreground), so an uncapped churn would starve `chat_room_open`. A boot binds up to seven
 * slots — the relay, the selected cloud and five background clouds — so ten keeps a whole boot and a
 * few reconnects after it.
 */
export const SOCKET_VERIFY_SAMPLES_PER_MINUTE = 10;

const MINUTE_MS = 60_000;

/** The message the backend sends once the device row is saved for this connection. */
const DEVICE_SAVED_MESSAGE = 'device.save:ok';

/** Why a connection attempt started. */
type VerifyCause = 'bind' | 'reconnect' | 'resume';

/** How an attempt ended: authenticated, the socket went away first, or the auth controller gave up. */
type VerifyOutcome = 'verified' | 'closed' | 'expired';

interface Attempt {
    startedAt: number;
    /** `pageHideCount()` when the attempt began: if it moves, the attempt spanned hidden time. */
    hidesAtStart: number;
    cause: VerifyCause;
    connectedAt?: number;
    deviceSavedAt?: number;
}

type ObservedClient = Pick<ClientSocketV2, 'onState' | 'onMessage'> & { readonly state?: string };

/** Slots the foreground wake recovery is about to reconnect, so their next attempt reads as a resume. */
const resumeKicks = new Set<SlotKey>();

/** The observer attached to each client, so a second bootstrap of the same client replaces it. */
const observers = new WeakMap<object, () => void>();

let windowStart = Number.NEGATIVE_INFINITY;
let recordedInWindow = 0;

/**
 * Marks `key`'s next connection attempt as the one the app's return to the foreground forced.
 * Called by the wake recovery right before it reconnects the slot.
 */
export const noteResumeKick = (key: SlotKey): void => {
    resumeKicks.add(key);
};

/**
 * Forgets a resume mark nothing used. Called by the wake recovery after its reconnect: if that opened
 * an attempt, the mark is already spent, and if it did not, a later attempt must not inherit it.
 */
export const clearResumeKick = (key: SlotKey): void => {
    resumeKicks.delete(key);
};

const takeBudget = (at: number): boolean => {
    if (at - windowStart >= MINUTE_MS) {
        windowStart = at;
        recordedInWindow = 0;
    }
    if (recordedInWindow >= SOCKET_VERIFY_SAMPLES_PER_MINUTE) return false;
    recordedInWindow += 1;
    return true;
};

interface ObserveSocketVerifyOptions {
    key: SlotKey;
    client: ObservedClient;
    auth: { onAuthState(listener: (state: string) => void): () => void };
    /** Overridable for tests. */
    now?: () => number;
    record?: typeof recordPerfSample;
    isHidden?: () => boolean;
    hideCount?: () => number;
}

/**
 * Times each connection attempt of one slot, from `connecting` to the socket being verified, and
 * records it as a `socket_verify` sample with the phases on the way: `connected_ms` (the WebSocket is
 * open), `device_ms` (`device.save:ok`, which opens the auth gate) and `value_ms` (the end).
 *
 * A sample rather than a start and a stop, because a boot's first connections happen before the
 * WebView knows where its traces go: a held start would reach Firebase late, and Firebase would time
 * the wrong span. Timed here instead, the numbers do not depend on when they are delivered.
 *
 * An attempt ends `verified`, `closed` (the socket went away first) or `expired` (the auth controller
 * gave up while the socket stayed open). The last two are recorded on purpose: a socket that never
 * verifies is the case the trace is for. A re-authentication on a live connection opens no attempt
 * and records nothing.
 *
 * An attempt that started while the page was hidden, or that the page was hidden during, records
 * nothing: it would time the OS suspending the page, not anything a person waited on. The background
 * budget is a tenth of the foreground one besides.
 *
 * Observing a client that already has an observer replaces it, so a slot booted again on the same
 * client — the binder retrying a boot whose first connect failed — is not recorded twice.
 *
 * @returns Stops observing.
 */
export const observeSocketVerify = ({
    key,
    client,
    auth,
    now = perfNow,
    record = recordPerfSample,
    isHidden = isPageHidden,
    hideCount = pageHideCount,
}: ObserveSocketVerifyOptions): (() => void) => {
    observers.get(client)?.();

    let attempt: Attempt | null = null;
    // A client already past `idle` has connected before, under an earlier observer: its next attempt
    // is a reconnect, not the slot's first.
    let attempts = client.state && client.state !== 'idle' ? 1 : 0;

    const finish = (outcome: VerifyOutcome) => {
        const done = attempt;
        attempt = null;
        if (!done || isHidden() || hideCount() !== done.hidesAtStart) return;
        const at = now();
        if (!takeBudget(at)) return;
        const since = (time: number) => Math.round(time - done.startedAt);
        record('socket_verify', {
            attributes: { kind: kindOf(key), cause: done.cause, outcome },
            metrics: {
                value_ms: since(at),
                ...(done.connectedAt === undefined ? {} : { connected_ms: since(done.connectedAt) }),
                ...(done.deviceSavedAt === undefined ? {} : { device_ms: since(done.deviceSavedAt) }),
            },
        });
    };

    const unsubscribes = [
        client.onState(event => {
            if (event.next === 'connecting') {
                attempts += 1;
                const cause: VerifyCause = resumeKicks.delete(key) ? 'resume' : attempts === 1 ? 'bind' : 'reconnect';
                attempt = isHidden() ? null : { startedAt: now(), hidesAtStart: hideCount(), cause };
            } else if (event.next === 'connected') {
                if (attempt && attempt.connectedAt === undefined) attempt.connectedAt = now();
            } else if (event.next === 'closed' || event.next === 'idle') {
                finish('closed');
            }
        }),
        client.onMessage(event => {
            if (event.message?.type !== DEVICE_SAVED_MESSAGE) return;
            if (attempt && attempt.deviceSavedAt === undefined) attempt.deviceSavedAt = now();
        }),
        auth.onAuthState(state => {
            if (state === 'authenticated') finish('verified');
            else if (state === 'expired') finish('expired');
        }),
    ];

    const stop = () => {
        unsubscribes.forEach(unsubscribe => unsubscribe());
        if (observers.get(client) === stop) observers.delete(client);
    };
    observers.set(client, stop);
    return stop;
};

/** Forgets the shared per-minute budget and any pending resume marks. For tests. */
export const resetSocketVerifyTrace = (): void => {
    resumeKicks.clear();
    windowStart = Number.NEGATIVE_INFINITY;
    recordedInWindow = 0;
};
