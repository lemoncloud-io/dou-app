import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { app, powerMonitor, powerSaveBlocker } from 'electron';

import { AndroidFCM, Client, type PushReceiverMessage } from '@liamcottle/push-receiver';

/** FCM project credentials (mirror apps/mobile google-services.json), baked via MAIN_VITE_FCM_*. */
export interface FcmConfig {
    apiKey: string;
    projectId: string;
    senderId: string;
    appId: string;
    packageName: string;
}

/** A push parsed from the FCM data payload, ready for an OS notification + tap routing. */
export interface FcmPush {
    title?: string;
    body?: string;
    deeplink?: string;
    data: Record<string, string>;
}

interface SavedCreds {
    androidId: string;
    securityToken: string;
    token: string;
    /** Ids of pushes already seen — replayed-on-reconnect dedupe (push-receiver contract). */
    persistentIds: string[];
}

const RECONNECT_MS = 5_000;
// push-receiver has no app-level heartbeat and macOS TCP keepalive waits ~2h, so a
// silently dropped socket (network blip, NAT rebind, wifi roam) is otherwise
// undetectable. Periodically force a fresh connect as a safety net — short enough
// that a half-open socket recovers (and its queued pushes replay) within minutes
// rather than feeling like a sudden burst on the next focus.
const WATCHDOG_MS = 3 * 60 * 1_000;
// Min gap between focus-triggered reconnects so rapid window focus toggling doesn't
// churn the socket (the watchdog/powerMonitor reconnects also refresh this clock).
const FOCUS_RECONNECT_THROTTLE_MS = 30_000;
// Google expires tokens minted via its unofficial endpoints on a wall-clock schedule,
// so an always-on session that never relaunches can still go silent after a few days.
// Re-mint on a slow cadence (independent of the socket watchdog) and push the fresh
// token out so the renderer re-registers it before the old one's endpoint dies.
const REMINT_MS = 12 * 60 * 60 * 1_000;
const credsFile = (): string => join(app.getPath('userData'), 'chatic-fcm.json');

const loadCreds = (): SavedCreds | null => {
    try {
        const f = credsFile();
        return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as SavedCreds) : null;
    } catch {
        return null;
    }
};

const saveCreds = (creds: SavedCreds): void => {
    try {
        writeFileSync(credsFile(), JSON.stringify(creds));
    } catch {
        // best-effort persistence; a fresh register on next launch is acceptable.
    }
};

const appDataToObject = (appData: PushReceiverMessage['appData'] = []): Record<string, string> =>
    appData.reduce<Record<string, string>>((out, kv) => {
        if (kv?.key) out[kv.key] = kv.value;
        return out;
    }, {});

/** Full device registration: a fresh GCM checkin identity plus a fresh FCM token. */
const fullRegister = async (config: FcmConfig, persistentIds: string[]): Promise<SavedCreds> => {
    const registered = await AndroidFCM.register(
        config.apiKey,
        config.projectId,
        config.senderId,
        config.appId,
        config.packageName,
        ''
    );
    return {
        androidId: registered.gcm.androidId,
        securityToken: registered.gcm.securityToken,
        token: registered.fcm.token,
        persistentIds,
    };
};

/**
 * Mint a current FCM token for this launch. push-receiver has no token-refresh
 * event and Google silently expires tokens minted via its unofficial endpoints, so
 * a token cached across launches goes stale; the broker's SNS endpoint, bound to
 * that dead token, gets disabled on the first rejected delivery and the device goes
 * quiet. Re-minting every launch keeps the endpoint bound to a live token once the
 * renderer re-registers it (reg-dev?force=true re-creates + re-enables it).
 *
 * Reuse the saved GCM identity (androidId/securityToken) and refresh ONLY the token,
 * so the mtalk socket and its persistentId dedupe survive (a full register churns the
 * androidId). Fall back to a full register when there is no saved identity or the
 * refresh fails (e.g. the cached androidId itself expired). If even the full register
 * fails (offline / Google blip), degrade to the cached creds so the socket still comes
 * up and a later watchdog/remint can refresh; return null only when nothing is on disk.
 */
const obtainCreds = async (config: FcmConfig, saved: SavedCreds | null): Promise<SavedCreds | null> => {
    // Surgical refresh on the saved identity — keeps the receive socket (no identity churn).
    if (saved?.androidId && saved?.securityToken) {
        try {
            const installAuth = await AndroidFCM.installRequest(
                config.apiKey,
                config.projectId,
                config.appId,
                config.packageName,
                ''
            );
            const token = await AndroidFCM.registerRequest(
                saved.androidId,
                saved.securityToken,
                installAuth,
                config.apiKey,
                config.senderId,
                config.appId,
                config.packageName,
                ''
            );
            if (token) return { ...saved, token };
        } catch (error) {
            console.warn('[fcm] token refresh failed, re-registering', error);
        }
    }
    // No saved identity, or the refresh failed — try a full register.
    try {
        return await fullRegister(config, saved?.persistentIds ?? []);
    } catch (error) {
        console.warn('[fcm] register failed', error);
        // Offline / Google blip: degrade to the cached creds so the socket + retry
        // timers still come up; null only when there's nothing usable to connect with.
        return saved?.token && saved.androidId && saved.securityToken ? saved : null;
    }
};

// startFcm is a process-lifetime singleton; createWindow can re-run (a destroyed
// window + dock re-activate), and a second run would stack a duplicate watchdog,
// remint timer, powerSaveBlocker assertion, and socket. Guard against that.
let started = false;

/**
 * Cross-cloud push receiver. Desktop has no native FCM, so we register as an
 * Android device via push-receiver (validated: empty cert works, the API key is
 * not cert-restricted) and hold an MTLS connection to mtalk.google.com to
 * receive the pushes the backend fans out for every cloud (mobile-proven path).
 *
 * - `onToken` reports the FCM token so the renderer registers it with the broker
 *   (`reg-dev`, platform 'desktop'); the central pushes-api then targets this
 *   device for messages in ANY cloud.
 * - `onPush` gets each parsed push for an OS notification + deeplink routing.
 *
 * Best-effort: any failure is swallowed and logged so the app degrades to the
 * existing live-WebSocket same-cloud notifications rather than breaking.
 */
export const startFcm = async (
    config: FcmConfig,
    handlers: { onToken: (token: string) => void; onPush: (push: FcmPush) => void }
): Promise<void> => {
    if (!config.apiKey || !config.senderId || !config.appId) return; // not configured for this build
    if (started) return; // singleton — a re-created window must not stack a 2nd receiver
    started = true;

    // Cross-cloud push rides this in-process mtalk socket (not an OS push daemon), so it —
    // and the reconnect watchdog below — stop the moment macOS App Nap suspends the app
    // after a long background stint. Hold a 'prevent-app-suspension' assertion so both keep
    // running while backgrounded (display may still sleep; only the OS nap is blocked).
    // Scoped here, past the config guard, so unconfigured builds don't pay the battery cost.
    powerSaveBlocker.start('prevent-app-suspension');

    // Refresh the FCM token every launch (Google expires cached ones), reusing the
    // saved GCM identity so the receive socket survives. See obtainCreds.
    const session = await obtainCreds(config, loadCreds());
    if (!session) return; // no usable creds and registration failed — nothing to connect with
    saveCreds(session);

    handlers.onToken(session.token);

    let client: Client | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let lastConnectAt = 0;

    const scheduleReconnect = (): void => {
        if (reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, RECONNECT_MS);
    };

    const connect = (): void => {
        lastConnectAt = Date.now();
        client?.destroy(); // tear down any prior (possibly half-open) socket + its retry timer
        const c = new Client(session.androidId, session.securityToken, session.persistentIds);
        client = c;

        c.on('ON_DATA_RECEIVED', message => {
            if (client !== c) return; // orphan from a superseded connect(); ignore its replay
            if (message.persistentId) {
                session.persistentIds.push(message.persistentId);
                saveCreds(session);
            }
            const data = appDataToObject(message.appData);
            // The backend sends FCM *notification* fields, which push-receiver surfaces as
            // `gcm.notification.*` data keys (alongside `content`/`link`). Fall back to the
            // plain keys for test/non-backend payloads.
            handlers.onPush({
                title: data['gcm.notification.title'] || data.title,
                body: data['gcm.notification.body'] || data.content || data.body,
                deeplink: data.link || data.deeplink || data.url,
                data,
            });
        });

        c.on('disconnect', () => {
            // The library reconnects the same client on a clean socket close; stop
            // that and run our single managed reconnect instead (no zombie sockets).
            c.destroy();
            if (client !== c) return; // orphan from a superseded connect(); don't reschedule
            scheduleReconnect();
        });

        // connect() is async (checkin round-trip before the socket opens). Catch a
        // rejected login so a network/checkin failure schedules a retry instead of
        // dying silently as an unhandled rejection. Skip if a newer connect() superseded us.
        c.connect().catch(error => {
            if (client !== c) return;
            console.warn('[fcm] connect failed', error);
            scheduleReconnect();
        });
    };

    connect();

    // Sleep/wake and screen unlock leave the mtalk socket half-open — no 'close'
    // event fires, so neither the library nor the handler above reconnects, and
    // pushes are silently lost until the OS TCP keepalive (~2h) finally notices.
    // Force a fresh connect on resume so the server replays queued pushes
    // (persistentIds dedupe prevents double delivery).
    powerMonitor.on('resume', connect);
    powerMonitor.on('unlock-screen', connect);

    // Bringing the app to the foreground is NOT a powerMonitor 'resume' (the system
    // never slept), yet a long background stint is exactly when the socket may have
    // silently died — reconnect on focus for instant recovery on return, throttled so
    // routine focus changes don't churn the socket.
    app.on('browser-window-focus', () => {
        if (Date.now() - lastConnectAt >= FOCUS_RECONNECT_THROTTLE_MS) connect();
    });

    // Safety net for a half-open socket that fires no 'close'/'resume'/focus event
    // (silent network drop while the app stays awake). The server replays queued
    // pushes on the fresh login and persistentIds dedupe prevents doubles.
    setInterval(connect, WATCHDOG_MS);

    // Re-mint the FCM token on a slow cadence (see REMINT_MS) so an always-on
    // session doesn't lose pushes once Google expires the cached token. A
    // successful re-mint reuses the saved GCM identity and leaves the receive
    // socket untouched; only the full-register fallback churns the identity, so
    // reconnect onto it then. handlers.onToken re-registers the token downstream.
    const remint = async (): Promise<void> => {
        try {
            const next = await obtainCreds(config, session);
            if (!next) return; // mint failed and no usable creds — keep the live session
            const identityChanged =
                next.androidId !== session.androidId || next.securityToken !== session.securityToken;
            const tokenChanged = !!next.token && next.token !== session.token;
            if (!tokenChanged && !identityChanged) return;
            session.androidId = next.androidId;
            session.securityToken = next.securityToken;
            if (next.token) session.token = next.token;
            saveCreds(session);
            if (tokenChanged) handlers.onToken(session.token);
            if (identityChanged) connect();
        } catch (error) {
            console.warn('[fcm] periodic re-mint failed', error);
        }
    };
    setInterval(() => void remint(), REMINT_MS);
};
