import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { AndroidFCM, Client, type PushReceiverMessage } from '@liamcottle/push-receiver';

import { appendPersistentId, parseSavedCreds, type SavedCreds } from './fcmCreds';

export interface FcmConfig {
    apiKey: string;
    projectId: string;
    senderId: string;
    appId: string;
    packageName: string;
}

export type PushFailure = 'start' | 'refresh' | 'register' | 'connect' | 'remint';

export interface PushHost {
    credentialsPath: string;
    onWake?(reconnect: () => void): void;
    onFocus?(reconnect: () => void): void;
    keepAwake?(): void;
    onError?(stage: PushFailure, error: unknown): void;
}

const FAILURE_TEXT: Record<PushFailure, string> = {
    start: 'start failed',
    refresh: 'token refresh failed, re-registering',
    register: 'register failed',
    connect: 'connect failed',
    remint: 'periodic re-mint failed',
};

export const reportFailure = (host: PushHost, stage: PushFailure, error: unknown): void => {
    if (host.onError) return host.onError(stage, error);
    (stage === 'start' ? console.error : console.warn)(`[fcm] ${FAILURE_TEXT[stage]}`, error);
};

export interface FcmPush {
    title?: string;
    body?: string;
    deeplink?: string;
    data: Record<string, string>;
}

const RECONNECT_MS = 5_000;
const WATCHDOG_MS = 3 * 60 * 1_000;
const FOCUS_RECONNECT_THROTTLE_MS = 30_000;
const REMINT_MS = 12 * 60 * 60 * 1_000;
const loadCreds = (path: string): SavedCreds | null => {
    try {
        return existsSync(path) ? parseSavedCreds(readFileSync(path, 'utf8')) : null;
    } catch {
        return null;
    }
};

const saveCreds = (path: string, creds: SavedCreds): void => {
    try {
        writeFileSync(path, JSON.stringify(creds));
    } catch {
        return;
    }
};

const parseJsonObject = (raw: string | undefined): Record<string, string> => {
    if (!raw) return {};
    try {
        const value = JSON.parse(raw) as unknown;
        if (!value || typeof value !== 'object') return {};
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
    } catch {
        return {};
    }
};

const firstArrayItem = (raw: string | undefined): string | undefined => {
    if (!raw) return undefined;
    try {
        const value = JSON.parse(raw) as unknown;
        return Array.isArray(value) && value.length > 0 ? String(value[0]) : undefined;
    } catch {
        return undefined;
    }
};

const appDataToObject = (appData: PushReceiverMessage['appData'] = []): Record<string, string> =>
    appData.reduce<Record<string, string>>((out, kv) => {
        if (kv?.key) out[kv.key] = kv.value;
        return out;
    }, {});

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

const obtainCreds = async (config: FcmConfig, saved: SavedCreds | null, host: PushHost): Promise<SavedCreds | null> => {
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
            reportFailure(host, 'refresh', error);
        }
    }
    try {
        return await fullRegister(config, saved?.persistentIds ?? []);
    } catch (error) {
        reportFailure(host, 'register', error);
        return saved?.token && saved.androidId && saved.securityToken ? saved : null;
    }
};

let started = false;

export const startFcm = async (
    config: FcmConfig,
    handlers: { onToken: (token: string) => void; onPush: (push: FcmPush) => void },
    host: PushHost
): Promise<void> => {
    if (!config.apiKey || !config.senderId || !config.appId) return;
    if (started) return;
    started = true;

    host.keepAwake?.();

    const save = (creds: SavedCreds): void => saveCreds(host.credentialsPath, creds);
    const session = await obtainCreds(config, loadCreds(host.credentialsPath), host);
    if (!session) return;
    save(session);

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
        client?.destroy();
        const c = new Client(session.androidId, session.securityToken, [...session.persistentIds]);
        client = c;

        c.on('ON_DATA_RECEIVED', message => {
            if (client !== c) return;
            if (message.persistentId) {
                session.persistentIds = appendPersistentId(session.persistentIds, message.persistentId);
                save(session);
            }
            const data = appDataToObject(message.appData);
            const payload = parseJsonObject(data.payload);
            handlers.onPush({
                title: data['gcm.notification.title'] || firstArrayItem(data.title_loc_args) || data.title,
                body:
                    data['gcm.notification.body'] ||
                    firstArrayItem(data.loc_args) ||
                    payload.content ||
                    data.content ||
                    data.body,
                deeplink: data.link || data.deeplink || data.url,
                data: { ...data, ...payload },
            });
        });

        c.on('disconnect', () => {
            c.destroy();
            if (client !== c) return;
            scheduleReconnect();
        });

        c.connect().catch(error => {
            if (client !== c) return;
            reportFailure(host, 'connect', error);
            scheduleReconnect();
        });
    };

    connect();

    host.onWake?.(connect);
    host.onFocus?.(() => {
        if (Date.now() - lastConnectAt >= FOCUS_RECONNECT_THROTTLE_MS) connect();
    });

    setInterval(connect, WATCHDOG_MS);

    const remint = async (): Promise<void> => {
        try {
            const next = await obtainCreds(config, session, host);
            if (!next) return;
            const identityChanged =
                next.androidId !== session.androidId || next.securityToken !== session.securityToken;
            const tokenChanged = !!next.token && next.token !== session.token;
            if (!tokenChanged && !identityChanged) return;
            session.androidId = next.androidId;
            session.securityToken = next.securityToken;
            if (next.token) session.token = next.token;
            save(session);
            if (tokenChanged) handlers.onToken(session.token);
            if (identityChanged) connect();
        } catch (error) {
            reportFailure(host, 'remint', error);
        }
    };
    setInterval(() => void remint(), REMINT_MS);
};
