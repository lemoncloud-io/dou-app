import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { app, powerMonitor } from 'electron';

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

    let creds = loadCreds();
    if (!creds?.token || !creds.androidId || !creds.securityToken) {
        const registered = await AndroidFCM.register(
            config.apiKey,
            config.projectId,
            config.senderId,
            config.appId,
            config.packageName,
            ''
        );
        creds = {
            androidId: registered.gcm.androidId,
            securityToken: registered.gcm.securityToken,
            token: registered.fcm.token,
            persistentIds: [],
        };
        saveCreds(creds);
    }
    const session = creds;

    handlers.onToken(session.token);

    let client: Client | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleReconnect = (): void => {
        if (reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, RECONNECT_MS);
    };

    const connect = (): void => {
        client?.destroy(); // tear down any prior (possibly half-open) socket + its retry timer
        const c = new Client(session.androidId, session.securityToken, session.persistentIds);
        client = c;

        c.on('ON_DATA_RECEIVED', message => {
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
            scheduleReconnect();
        });

        c.connect();
    };

    connect();

    // Sleep/wake and screen unlock leave the mtalk socket half-open — no 'close'
    // event fires, so neither the library nor the handler above reconnects, and
    // pushes are silently lost until the OS TCP keepalive (~2h) finally notices.
    // Force a fresh connect on resume so the server replays queued pushes
    // (persistentIds dedupe prevents double delivery).
    powerMonitor.on('resume', connect);
    powerMonitor.on('unlock-screen', connect);
};
