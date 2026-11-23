import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';
import { logger } from '@chatic/logger';
import { perfNow } from '@chatic/perf';

import { Coalescer } from '../utils/coalescer';
import { authIdRegistry } from './authIdRegistry';
import {
    clearResumeKick,
    noteResumeKick,
    getSocketManager,
    APP_CLOSE_REASON,
    kindOf,
    getSocketErrorCode,
} from '@chatic/transport';
import type { ISocketManager, SlotKey, SocketKind } from '@chatic/transport';
import { type AuthStatus, getAuthStatus, needsLivenessProbe, needsSocketKick } from './authStatus';
import { createSocketSessionDelegate } from './sessionDelegate';
import type { AuthActivationGate } from './bootstrapSocketConnection';
import type { SocketSessionDelegate } from './types';

export interface RecoverUnverifiedSocketsDeps {
    manager?: ISocketManager;
    delegate?: SocketSessionDelegate;
    now?: () => number;
}

export const FIRST_CONNECT_GRACE_MS = 10_000;

export const RESUME_PROBE_TIMEOUT_MS = 3_000;

const coalescer = new Coalescer<void>();

export const recoverUnverifiedSockets = (deps: RecoverUnverifiedSocketsDeps = {}): Promise<void> =>
    coalescer.run(() => doRecover(deps, false));

export const recoverSocketsOnResume = (deps: RecoverUnverifiedSocketsDeps = {}): Promise<void> =>
    coalescer.run(() => doRecover(deps, true));

const doRecover = async (
    { manager, delegate, now = Date.now }: RecoverUnverifiedSocketsDeps,
    probeVerified: boolean
): Promise<void> => {
    const socketManager = manager ?? getSocketManager();
    const sessionDelegate = delegate ?? createSocketSessionDelegate();

    const active = socketManager.getBoundCid();
    const keys = [...socketManager.getSlotKeys()].sort((a, b) => Number(b === active) - Number(a === active));
    const kicks: Array<{ key: SlotKey; client: ClientSocketV2; status: AuthStatus }> = [];
    const probes: Promise<ProbeResult>[] = [];
    for (const key of keys) {
        const client = socketManager.getClient(key);
        if (!client) {
            continue;
        }
        const status = getAuthStatus(key, { manager: socketManager });
        if (needsSocketKick(status)) {
            const firstConnectAgeMs = firstConnectAge(socketManager.firstConnectSince(key), now());
            if (status === 'handshaking' && (client.state === 'idle' || firstConnectAgeMs !== undefined)) {
                logger.info('SOCKET', '[recoverUnverifiedSockets] leaving a first connect', {
                    data: { kind: kindOf(key), cid: key, state: client.state, firstConnectAgeMs },
                });
                continue;
            }
            kicks.push({ key, client, status });
        } else if (probeVerified && needsLivenessProbe(status)) {
            probes.push(probeSlot(key, client, socketManager));
        }
    }

    for (const { key, client, status } of kicks) {
        const kind = kindOf(key);
        const auth = client.auth;
        const wasExpired = status === 'expired';
        logger.info('SOCKET', '[recoverUnverifiedSockets] kicking unverified socket', {
            data: { kind, cid: key, state: client.state, status, wasExpired },
        });

        await recycleSlot(key, client, APP_CLOSE_REASON.wakeRecovery, async () => {
            if (!wasExpired || !auth) return;
            const registration = await sessionDelegate.getAuthRegistration(key);
            if (!registration) return;
            auth.register({
                token: registration.token,
                authId: registration.authId,
                sign: (token, ctx) => sessionDelegate.signAuth(key, token, ctx?.target),
            });
            authIdRegistry.record(key, registration.authId);
            (auth as unknown as AuthActivationGate).stop();
        });
    }
    const results = await Promise.all(probes);
    if (results.length > 0) {
        logger.info('SOCKET', '[recoverUnverifiedSockets] probed', { data: { probes: results } });
    }
};

const firstConnectAge = (since: number | undefined, at: number): number | undefined => {
    if (since === undefined) return undefined;
    const age = at - since;
    return age >= 0 && age < FIRST_CONNECT_GRACE_MS ? age : undefined;
};

interface ProbeResult {
    kind: SocketKind;
    cid: SlotKey;
    outcome: 'answered' | 'heard' | 'closed' | 'refused' | 'recycled';
    rttMs: number;
}

const probeSlot = async (key: SlotKey, client: ClientSocketV2, socketManager: ISocketManager): Promise<ProbeResult> => {
    const startedAt = perfNow();
    const result = (outcome: ProbeResult['outcome']): ProbeResult => ({
        kind: kindOf(key),
        cid: key,
        outcome,
        rttMs: Math.round(perfNow() - startedAt),
    });
    let heard = false;
    const stopListening = client.onMessage(() => {
        heard = true;
    });
    try {
        await client.request('system.ping' as never, null as never, { timeoutMs: RESUME_PROBE_TIMEOUT_MS });
        return result('answered');
    } catch (error) {
        const code = getSocketErrorCode(error);
        if (code === 499 || code === 503) return result('closed');
        if (code !== 408) return result('refused');
        if (heard) return result('heard');
        if (socketManager.getClient(key) !== client || client.state !== 'connected') return result('closed');
    } finally {
        stopListening();
    }

    const recycled = result('recycled');
    await recycleSlot(key, client, APP_CLOSE_REASON.wakeProbe);
    return recycled;
};

const recycleSlot = async (
    key: SlotKey,
    client: ClientSocketV2,
    reason: string,
    beforeConnect?: () => Promise<void>
): Promise<void> => {
    noteResumeKick(key);
    await client.disconnect(1000, reason).catch(() => undefined);
    await beforeConnect?.().catch(error => {
        logger.warn('SOCKET', '[recoverUnverifiedSockets] re-seed before reconnect failed', {
            error,
            data: { kind: kindOf(key), cid: key },
        });
    });
    await client.connect().catch(error => {
        logger.warn('SOCKET', '[recoverUnverifiedSockets] reconnect kick failed', {
            error,
            data: { kind: kindOf(key), cid: key },
        });
    });
    clearResumeKick(key);
};
