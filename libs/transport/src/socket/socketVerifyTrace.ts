import { isPageHidden, pageHideCount, perfNow, recordPerfSample } from '@chatic/perf';

import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import type { SlotKey } from './types';
import { kindOf } from './utils/slotKey';

export const SOCKET_VERIFY_SAMPLES_PER_MINUTE = 10;

const MINUTE_MS = 60_000;

const DEVICE_SAVED_MESSAGE = 'device.save:ok';

type VerifyCause = 'bind' | 'reconnect' | 'resume';

type VerifyOutcome = 'verified' | 'closed' | 'expired';

interface Attempt {
    startedAt: number;
    hidesAtStart: number;
    cause: VerifyCause;
    connectedAt?: number;
    deviceSavedAt?: number;
}

type ObservedClient = Pick<ClientSocketV2, 'onState' | 'onMessage'> & { readonly state?: string };

const resumeKicks = new Set<SlotKey>();

const observers = new WeakMap<object, () => void>();

let windowStart = Number.NEGATIVE_INFINITY;
let recordedInWindow = 0;

export const noteResumeKick = (key: SlotKey): void => {
    resumeKicks.add(key);
};

export const clearResumeKick = (key: SlotKey): void => {
    resumeKicks.delete(key);
};

export const hasResumeKick = (key: SlotKey): boolean => resumeKicks.has(key);

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
    now?: () => number;
    record?: typeof recordPerfSample;
    isHidden?: () => boolean;
    hideCount?: () => number;
}

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

export const resetSocketVerifyTrace = (): void => {
    resumeKicks.clear();
    windowStart = Number.NEGATIVE_INFINITY;
    recordedInWindow = 0;
};
