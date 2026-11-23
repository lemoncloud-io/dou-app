import { lookup } from 'node:dns/promises';

import type { Page, Request, Route, WebSocketRoute } from '@playwright/test';

import { E2E_BASE_URL, E2E_ENDPOINTS } from '../support/env';
import { GUEST, guestProfile, guestRelayProfile, registerDeviceAnswer, SELF_CHANNEL, selfJoin } from './guest';

export type HttpHandler = (request: Request) => unknown;

export class RawBody {
    constructor(
        readonly body: Buffer,
        readonly contentType: string
    ) {}
}

export interface SocketFrame {
    type: string;
    data: unknown;
    mid?: string;
}

export const NO_REPLY = Symbol('no reply');

export type SocketHandler = (data: unknown, frame: SocketFrame) => unknown;

export class SocketRefusal extends Error {}

export interface HttpFault {
    match: string | RegExp;
    status?: number;
    hang?: boolean;
    hangMs?: number;
    delayMs?: number;
    times?: number;
    hits?: number;
}

export interface SocketFault {
    type: string | RegExp;
    endpoint?: string;
    error?: string;
    drop?: boolean;
    delayMs?: number;
    times?: number;
    hits?: number;
}

export interface SentFrame extends SocketFrame {
    endpoint: string;
    connection: number;
}

export class FakeBackend {
    readonly unexpected: string[] = [];
    readonly allFrames: SentFrame[] = [];
    private readonly http = new Map<string, HttpHandler>();
    private readonly socketTables = new Map<string, Map<string, SocketHandler>>();
    private readonly openSockets = new Map<WebSocketRoute, string>();
    private readonly silentSockets = new Set<WebSocketRoute>();
    private readonly connectionCounts = new Map<string, number>();
    private readonly httpFaults: HttpFault[] = [];
    private readonly socketFaults: SocketFault[] = [];
    private networkDown = false;
    private readonly socketsRefusedUntil = new Map<string, number>();
    httpRequests = 0;
    refusedConnections = 0;
    deviceId = '';

    private constructor() {
        this.useHttp(guestHttp(this));
        this.useSocket(guestSocket(this));
    }

    static async install(page: Page): Promise<FakeBackend> {
        const backend = new FakeBackend();
        await page.route(new RegExp(`^(?!${escapeRegExp(E2E_BASE_URL)}/)`), route => backend.answerHttp(route));
        const devHost = escapeRegExp(new URL(E2E_BASE_URL).host);
        await page.routeWebSocket(new RegExp(`^wss?://(?!${devHost}/)`), ws => backend.attach(ws));
        return backend;
    }

    useHttp(handlers: Record<string, HttpHandler>): void {
        for (const [key, handler] of Object.entries(handlers)) this.http.set(key, handler);
    }

    gateHttp(key: string, gate: () => Promise<unknown>): void {
        const handler = this.http.get(key);
        if (!handler) throw new Error(`gateHttp: no handler for ${key}`);
        this.http.set(key, async request => {
            await gate();
            return handler(request);
        });
    }

    get frames(): SentFrame[] {
        return this.allFrames.filter(frame => frame.endpoint === E2E_ENDPOINTS.socket);
    }

    sent(type: string): SentFrame[] {
        return this.sentAt(E2E_ENDPOINTS.socket, type);
    }

    sentAt(endpoint: string, type: string): SentFrame[] {
        return this.allFrames.filter(frame => frame.endpoint === endpoint && frame.type === type);
    }

    useSocket(handlers: Record<string, SocketHandler>): void {
        this.useSocketAt(E2E_ENDPOINTS.socket, handlers);
    }

    useSocketAt(endpoint: string, handlers: Record<string, SocketHandler>): void {
        let table = this.socketTables.get(endpoint);
        if (!table) {
            table = new Map();
            this.socketTables.set(endpoint, table);
        }
        for (const [type, handler] of Object.entries(handlers)) table.set(type, handler);
    }

    handlerOf(type: string): SocketHandler {
        const handler = this.socketTables.get(E2E_ENDPOINTS.socket)?.get(type);
        if (!handler) throw new Error(`handlerOf: no handler for ${type}`);
        return handler;
    }

    get connections(): number {
        return this.connectionCounts.get(E2E_ENDPOINTS.socket) ?? 0;
    }

    async dropSockets(): Promise<void> {
        const relay = [...this.openSockets].filter(([, endpoint]) => endpoint === E2E_ENDPOINTS.socket);
        for (const [ws] of relay) this.openSockets.delete(ws);
        await Promise.all(relay.map(([ws]) => ws.close({ code: 1001, reason: 'e2e: dropped by the relay' })));
    }

    push(frame: SocketFrame, endpoint: string = E2E_ENDPOINTS.socket): number {
        const targets = [...this.openSockets]
            .filter(([ws, open]) => open === endpoint && !this.silentSockets.has(ws))
            .map(([ws]) => ws);
        const raw = JSON.stringify({ ...frame, meta: { ts: Date.now() } });
        for (const ws of targets) ws.send(raw);
        return targets.length;
    }

    async closeSocketsAt(endpoint: string): Promise<void> {
        const sockets = [...this.openSockets].filter(([, open]) => open === endpoint).map(([ws]) => ws);
        await this.closeAll(sockets, 'e2e: dropped by the cloud');
    }

    silenceSockets(): void {
        for (const [ws, endpoint] of this.openSockets) {
            if (endpoint === E2E_ENDPOINTS.socket) this.silentSockets.add(ws);
        }
    }

    addHttpFault(fault: HttpFault): () => void {
        const entry = fault;
        this.httpFaults.push(entry);
        return () => removeFrom(this.httpFaults, entry);
    }

    addSocketFault(fault: SocketFault): () => void {
        const entry = fault;
        this.socketFaults.push(entry);
        return () => removeFrom(this.socketFaults, entry);
    }

    async setNetworkDown(down: boolean): Promise<void> {
        if (down) await assertUnresolvable();
        this.networkDown = down;
        if (down) await this.closeAll(this.openSockets.keys(), 'e2e: the network went away');
    }

    async refuseSockets(ms: number, endpoint: string = E2E_ENDPOINTS.socket): Promise<void> {
        await assertUnresolvable();
        this.socketsRefusedUntil.set(endpoint, Date.now() + ms);
        await this.closeSocketsAt(endpoint);
    }

    private async answerHttp(route: Route): Promise<void> {
        this.httpRequests += 1;
        const request = route.request();
        const url = new URL(request.url());
        const relay = new URL(E2E_ENDPOINTS.relay);
        const onRelay = url.origin === relay.origin && url.pathname.startsWith(relay.pathname);
        const fullKey = `${request.method()} ${url.origin}${url.pathname}`;
        const relayKey = onRelay ? `${request.method()} ${url.pathname.slice(relay.pathname.length)}` : undefined;
        if (this.networkDown) return route.abort('internetdisconnected');
        const { delayMs, fault } = takeFaults(
            this.httpFaults,
            f => matchesKey(f.match, fullKey, relayKey),
            f => Boolean(f.hang || f.status)
        );
        if (delayMs) await sleep(delayMs);
        if (fault?.hang) {
            await sleep(fault.hangMs ?? 30_000);
            return route.abort('timedout').catch(() => undefined);
        }
        if (fault?.status) {
            return route.fulfill({ status: fault.status, json: { message: `e2e: chaos ${fault.status}` } });
        }
        const handler =
            this.http.get(fullKey) ?? (relayKey ? this.http.get(relayKey) : undefined) ?? this.prefixHandler(fullKey);
        if (!handler) {
            this.unexpected.push(fullKey);
            return route.abort();
        }
        try {
            const answer = await handler(request);
            if (answer instanceof RawBody) {
                return await route.fulfill({ body: answer.body, contentType: answer.contentType });
            }
            return await route.fulfill({ json: answer });
        } catch (error) {
            return route.fulfill({ status: 500, json: { message: String(error) } });
        }
    }

    private attach(ws: WebSocketRoute): void {
        const endpoint = [...this.socketTables.keys()]
            .filter(candidate => ws.url().startsWith(candidate))
            .sort((a, b) => b.length - a.length)[0];
        if (!endpoint) {
            this.unexpected.push(`socket connect ${ws.url().split('?')[0]}`);
            void ws.close({ code: 1008, reason: 'e2e: no fixture for this socket' });
            return;
        }
        if (this.networkDown || Date.now() < (this.socketsRefusedUntil.get(endpoint) ?? 0)) {
            this.refusedConnections += 1;
            ws.connectToServer();
            return;
        }
        const table = this.socketTables.get(endpoint) as Map<string, SocketHandler>;
        const connection = (this.connectionCounts.get(endpoint) ?? 0) + 1;
        this.connectionCounts.set(endpoint, connection);
        this.openSockets.set(ws, endpoint);
        ws.onClose(() => {
            this.openSockets.delete(ws);
            this.silentSockets.delete(ws);
        });
        ws.onMessage(raw => {
            let frame: SocketFrame;
            try {
                frame = JSON.parse(String(raw)) as SocketFrame;
            } catch {
                return;
            }
            this.allFrames.push({ ...frame, endpoint, connection });
            if (this.silentSockets.has(ws)) return;
            const meta = { ts: Date.now() };
            const reply = (body: Record<string, unknown>) => ws.send(JSON.stringify({ mid: frame.mid, meta, ...body }));
            const handler = table.get(frame.type);
            if (!handler) {
                this.unexpected.push(
                    endpoint === E2E_ENDPOINTS.socket ? `socket ${frame.type}` : `socket ${frame.type} @ ${endpoint}`
                );
                if (frame.mid) reply({ type: `${frame.type}:error`, data: null, error: 'no fixture' });
                return;
            }
            const refuse = (error: unknown) =>
                reply({
                    type: `${frame.type}:error`,
                    data: null,
                    error: error instanceof Error ? error.message : String(error),
                });
            const answer = (data: unknown) => {
                if (data === NO_REPLY) return;
                if (data === undefined && !frame.mid) return;
                reply({ type: `${frame.type}:ok`, data: data ?? null });
            };
            const { delayMs, fault } = takeFaults(
                this.socketFaults,
                f => (!f.endpoint || f.endpoint === endpoint) && matchesType(f.type, frame.type),
                f => Boolean(f.drop || f.error)
            );
            let data: unknown;
            if (delayMs || fault) {
                data = sleep(delayMs).then(() => {
                    if (!this.openSockets.has(ws) || fault?.drop) return NO_REPLY;
                    if (fault?.error) throw new SocketRefusal(fault.error);
                    return handler(frame.data, frame);
                });
            } else {
                try {
                    data = handler(frame.data, frame);
                } catch (error) {
                    refuse(error);
                    return;
                }
            }
            if (!(data instanceof Promise)) {
                answer(data);
                return;
            }
            void data.then(answer, refuse);
        });
    }

    private prefixHandler(fullKey: string): HttpHandler | undefined {
        for (const [key, handler] of this.http) {
            if (key.endsWith('/*') && fullKey.startsWith(key.slice(0, -1))) return handler;
        }
        return undefined;
    }

    private async closeAll(sockets: Iterable<WebSocketRoute>, reason: string): Promise<void> {
        const all = [...sockets];
        for (const ws of all) this.openSockets.delete(ws);
        await Promise.all(all.map(ws => ws.close({ code: 1001, reason }).catch(() => undefined)));
    }
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const removeFrom = <T>(list: T[], item: T): void => {
    const index = list.indexOf(item);
    if (index >= 0) list.splice(index, 1);
};

const takeFaults = <T extends { times?: number; hits?: number; delayMs?: number }>(
    faults: T[],
    matches: (fault: T) => boolean,
    isTerminal: (fault: T) => boolean
): { delayMs: number; fault: T | undefined } => {
    let delayMs = 0;
    let terminal: T | undefined;
    for (const fault of faults.filter(matches)) {
        if (terminal && isTerminal(fault)) continue;
        fault.hits = (fault.hits ?? 0) + 1;
        delayMs += fault.delayMs ?? 0;
        if (isTerminal(fault)) terminal = fault;
        if (fault.times !== undefined) {
            fault.times -= 1;
            if (fault.times <= 0) faults.splice(faults.indexOf(fault), 1);
        }
    }
    return { delayMs, fault: terminal };
};

let resolvable: Promise<void> | undefined;

const assertUnresolvable = (): Promise<void> =>
    (resolvable ??= lookup(new URL(E2E_ENDPOINTS.socket).hostname).then(
        ({ address }) => {
            throw new Error(
                `${new URL(E2E_ENDPOINTS.socket).hostname} resolves to ${address}: this resolver answers names under .test, so a refused socket would reach a real host`
            );
        },
        () => undefined
    ));

const matchesKey = (match: string | RegExp, fullKey: string, relayKey: string | undefined): boolean =>
    typeof match === 'string'
        ? match === fullKey || match === relayKey
        : match.test(fullKey) || (relayKey !== undefined && match.test(relayKey));

const matchesType = (match: string | RegExp, type: string): boolean =>
    typeof match === 'string' ? match === type : match.test(type);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const guestHttp = (backend: FakeBackend): Record<string, HttpHandler> => ({
    'POST /oauth/register-device': request => {
        backend.deviceId = (request.postDataJSON() as { deviceId: string }).deviceId;
        return registerDeviceAnswer(backend.deviceId);
    },
    'GET /memberships/0/mine': () => ({
        id: `MS${GUEST.uid}`,
        createdAt: GUEST.createdAt,
        updatedAt: GUEST.createdAt,
        deletedAt: 0,
        $: { sid: GUEST.sid, uid: GUEST.uid },
        status: 'none',
        userId: GUEST.uid,
        isValid: false,
    }),
    'GET /clouds/0/list': () => ({ sort: '', limit: 2000, page: 0, list: [], total: 0, aggr: { status: {} } }),
});

const guestSocket = (backend: FakeBackend): Record<string, SocketHandler> => ({
    'system.ping': () => ({ ts: Date.now() }),
    'device.save': data => ({ ...(data as object), status: 'green' }),
    'device.sync': () => undefined,
    'auth.update': () => ({
        cloudId: '#',
        connId: 'e2e-conn',
        deviceId: backend.deviceId,
        authId: `device:${GUEST.accountId}`,
        memberId: GUEST.uid,
        state: 'authenticated',
        stateAt: GUEST.createdAt,
        expiresIn: 2_592_000_000,
        error: '',
        member$: { id: GUEST.uid, name: backend.deviceId },
    }),
    'auth.refresh': () => registerDeviceAnswer(backend.deviceId),
    'auth.switch': () => registerDeviceAnswer(backend.deviceId),
    'user.my-site': () => ({ list: [], total: 0 }),
    'user.profile': () => guestProfile(backend.deviceId),
    'profile.get-mine': () => guestRelayProfile,
    'profile.get': () => guestRelayProfile,
    'profile.sync': () => ({ profiles: {}, syncedAt: GUEST.createdAt }),
    'channel.sync': () => ({ list: [SELF_CHANNEL], ids: [SELF_CHANNEL.id], syncedAt: GUEST.createdAt }),
    'channel.get-self': () => SELF_CHANNEL,
    'channel.get': data => ((data as { id?: string } | null)?.id === SELF_CHANNEL.id ? SELF_CHANNEL : null),
    'channel.sync-users': () => ({
        list: [{ id: GUEST.uid, name: backend.deviceId, $join: selfJoin }],
        ids: [GUEST.uid],
        syncedAt: GUEST.createdAt,
    }),
    'join.get': () => selfJoin,
    'chat.feed': () => ({ list: [], cursorNo: 0, readNo: 0, total: 0 }),
});
