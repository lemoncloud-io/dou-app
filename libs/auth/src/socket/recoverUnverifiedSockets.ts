import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';
import { logger } from '@chatic/bridges';
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
}

/**
 * How long a slot that reads verified gets to answer the foreground probe before it is recycled.
 *
 * A live socket answers a ping in one round trip, well under a second even on a cellular link that
 * is waking up. The keep-alive gives a ping 10 s and recycles only after two misses, which is the
 * 40–80 s a zombie has cost on every resume; 3 s is short enough that a refetch fired on the same
 * foreground is still in flight when the recycle lands, and long enough that a slow radio is not
 * mistaken for a dead socket.
 */
export const RESUME_PROBE_TIMEOUT_MS = 3_000;

/**
 * Concurrent passes collapse onto the in-flight run. One coalescer for both entry points: a call that
 * lands while either is running joins that pass, so a resume call joining a plain pass gets no probe.
 * No app calls both — apps/web uses the resume pass, admin-v2 the plain one — and two coalescers
 * would let both passes recycle the same slot at once.
 */
const coalescer = new Coalescer<void>();

/**
 * Foreground/wake kick for wedged sockets (generalizes the desktop-web `useSocketWakeRecovery`
 * pattern into the runtime). After a suspension the transport
 * can be a half-open zombie — recovery otherwise waits for the keep-alive loop to miss two pongs
 * (~40-80s) before the reconnect controller re-establishes and the SDK re-authenticates.
 *
 * Per bound slot that is NOT verified:
 *  1. Force-close the transport. `connect()` below re-arms the SDK reconnect controller, so a
 *     failed attempt still keeps auto-reconnect running.
 *  2. If the controller is terminally `expired`, re-seed it via `register()` (idempotent; resets
 *     the failure budget and moves the state off `expired`, so the bootstrap gate's expired-resume
 *     throttle does not apply to this user-visible recovery) — then immediately re-close the
 *     activation gate so the next `connected` cannot auto-send auth.update BEFORE that
 *     connection's device.save:ok (the bootstrap gate owns the ordering).
 *  3. Reconnect. device.save:ok → gate.start() → auth.update, in order.
 *
 * A slot whose flags are stale-verified (zombie that still reports verified) is left to the
 * keep-alive path here; {@link recoverSocketsOnResume} is the pass that also checks those.
 */
export const recoverUnverifiedSockets = (deps: RecoverUnverifiedSocketsDeps = {}): Promise<void> =>
    coalescer.run(() => doRecover(deps, false));

/**
 * {@link recoverUnverifiedSockets}, plus a liveness probe for every slot that reads verified.
 *
 * A half-open connection keeps the flags of the handshake it completed before the suspension, so the
 * kick above skips it, and the requests the app fires on the same foreground go into it and fail
 * together when the keep-alive finally gives up. Each such slot is sent one `system.ping` with a
 * {@link RESUME_PROBE_TIMEOUT_MS} timeout. A slot that answers — or from which any frame at all
 * arrives meanwhile — is left alone. One that stays silent while still reading `connected` is
 * recycled exactly like an unverified slot, with close reason `wake-probe` so `socket_request` can
 * tell the two apart.
 *
 * The probes run side by side and alongside the kicks, so the pass is bounded by one probe timeout
 * rather than one per slot. Nothing waits for them: the app's own foreground refetches go out at
 * once, and on a slot the probe recycles they fail and are repeated by the re-verify edge. Waiting
 * would add a round trip to every healthy foreground to save a refetch on the rare dead one.
 */
export const recoverSocketsOnResume = (deps: RecoverUnverifiedSocketsDeps = {}): Promise<void> =>
    coalescer.run(() => doRecover(deps, true));

const doRecover = async (
    { manager, delegate }: RecoverUnverifiedSocketsDeps,
    probeVerified: boolean
): Promise<void> => {
    const socketManager = manager ?? getSocketManager();
    const sessionDelegate = delegate ?? createSocketSessionDelegate();

    // Every bound slot, checked independently: relay can be wedged while a cloud is the active one.
    // The active slot goes first. Each kick awaits a disconnect and a connect, and with a background
    // session per cloud there can be several slots behind it — the one the user is looking at should
    // not wait for all of them.
    const active = socketManager.getBoundCid();
    const keys = [...socketManager.getSlotKeys()].sort((a, b) => Number(b === active) - Number(a === active));
    const kicks: Array<{ key: SlotKey; client: ClientSocketV2; status: AuthStatus }> = [];
    const probes: Promise<ProbeResult>[] = [];
    for (const key of keys) {
        const client = socketManager.getClient(key);
        if (!client) {
            continue;
        }
        // One judgement instead of two reads: `needsSocketKick` is true for
        // `handshaking` and `expired` — exactly the "bound but not verified on this connection"
        // set this used to express as `!isSlotVerified(key)`. A healthy-looking slot is never kicked
        // outright; kicking it on every foreground would churn warm reconnects. It is probed instead,
        // when the caller asked for that — and every probe is sent before the first kick, which
        // awaits a reconnect.
        const status = getAuthStatus(key, { manager: socketManager });
        if (needsSocketKick(status)) {
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
            // Mirror the seeded authId — every register() site must, or the drift check goes blind.
            authIdRegistry.record(key, registration.authId);
            // register() re-activated the controller; close the gate so the reconnect keeps
            // the device.save:ok → auth.update order (same rationale as reauthenticateActiveSocket).
            (auth as unknown as AuthActivationGate).stop();
        });
    }
    const results = await Promise.all(probes);
    // One line per pass, answered probes included: a probe that answers in 2.5 s is a near miss the
    // 3 s timeout has to be judged by, and a false recycle of an idle slot rejects no request, so
    // `socket_request` never sees it.
    if (results.length > 0) {
        logger.info('SOCKET', '[recoverUnverifiedSockets] probed', { data: { probes: results } });
    }
};

/** One probe's outcome, for the pass's log line. */
interface ProbeResult {
    kind: SocketKind;
    cid: SlotKey;
    /**
     * `answered` — the ping came back; `heard` — it timed out, but other frames arrived; `closed` —
     * the socket closed or was rebuilt meanwhile; `refused` — the server answered with an error;
     * `recycled` — silence, so the slot was recycled.
     */
    outcome: 'answered' | 'heard' | 'closed' | 'refused' | 'recycled';
    rttMs: number;
}

/**
 * Pings one slot that reads verified and recycles it when nothing comes back.
 *
 * Only a timeout counts, and only on the client the slot still holds while it still reads
 * `connected`. Any other rejection means the socket already closed (499, 503) and its reconnect
 * controller has it, or the server answered (a refusal is still an answer). Any frame that arrives
 * during the wait — the keep-alive's own pong, a push — proves the connection carries traffic, so a
 * ping that merely queued behind it is not taken for a dead socket.
 */
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

/**
 * Closes a slot's socket and connects it again. `beforeConnect` runs on the closed socket, so a
 * re-seed there cannot fire auth.update into the void and burn a failure.
 */
const recycleSlot = async (
    key: SlotKey,
    client: ClientSocketV2,
    reason: string,
    beforeConnect?: () => Promise<void>
): Promise<void> => {
    // The reconnect below is this kick's, so `socket_verify` records it as a resume.
    noteResumeKick(key);
    await client.disconnect(1000, reason).catch(() => undefined);
    // The disconnect stopped the reconnect controller, and only the connect below re-arms it, so a
    // failed re-seed must not skip it: the slot would stay closed with nothing left to reopen it.
    await beforeConnect?.().catch(error => {
        logger.warn('SOCKET', '[recoverUnverifiedSockets] re-seed before reconnect failed', {
            error,
            data: { kind: kindOf(key), cid: key },
        });
    });
    await client.connect().catch(error => {
        // connect() arms the SDK reconnect controller even on failure, so recovery continues
        // in the background; this kick just loses its head start.
        logger.warn('SOCKET', '[recoverUnverifiedSockets] reconnect kick failed', {
            error,
            data: { kind: kindOf(key), cid: key },
        });
    });
    // A reconnect that opened an attempt has spent the mark already; one that did not must not
    // leave it for a later, unrelated attempt.
    clearResumeKick(key);
};
