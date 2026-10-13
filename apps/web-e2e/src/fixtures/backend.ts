import type { Page, Request, Route, WebSocketRoute } from '@playwright/test';

import { E2E_BASE_URL, E2E_ENDPOINTS } from '../support/env';
import { GUEST, guestProfile, guestRelayProfile, registerDeviceAnswer, SELF_CHANNEL, selfJoin } from './guest';

/** One HTTP answer: the JSON body, sent with status 200. Throwing fails the request as a 500. */
export type HttpHandler = (request: Request) => unknown;

/** A socket frame as the relay sends and receives it. */
export interface SocketFrame {
    type: string;
    data: unknown;
    mid?: string;
}

/**
 * Leaves a socket request unanswered — the relay still working on it. For a scenario about what the
 * page shows while it waits, so that what comes after (an upload, say) is not decided by accident.
 */
export const NO_REPLY = Symbol('no reply');

/**
 * One socket request's answer: the data of its `:ok` frame. Throwing answers an `:error` frame instead.
 * A promise holds the answer until it settles — the relay slow on one request while the page goes on —
 * and a rejection answers the `:error` frame then.
 */
export type SocketHandler = (data: unknown, frame: SocketFrame) => unknown;

/**
 * A socket request the relay refuses. Thrown from a handler, its message becomes the `:error` frame's
 * `error` — status first, as the relay writes it (`403 FORBIDDEN - not a member of channel`), because
 * that leading status is what the page reads a refusal by.
 */
export class SocketRefusal extends Error {}

/** A frame the page sent, with the socket it went out on. */
export interface SentFrame extends SocketFrame {
    /** The endpoint the socket was opened to — `E2E_ENDPOINTS.socket` for the relay. */
    endpoint: string;
    /** Which opening of that socket it went out on, from 1: a frame after a reconnect says 2. */
    connection: number;
}

/**
 * The relay — its HTTP API and its socket — answered from fixtures, so no scenario depends on a
 * server being up or on what it holds. A scenario that enters a cloud adds the cloud's own host and
 * socket beside it (`useHttp` with a full address, `useSocketAt`); every host is under `.test`.
 *
 * Anything the page asks that no fixture answers is refused and recorded in `unexpected`: an HTTP
 * request is aborted the way an unreachable host fails, and a socket request gets a `:error` frame.
 * The list is attached to each test's report rather than failing it — the app adds requests in
 * ordinary feature work, and a scenario should break on what it is about, not on an unrelated new
 * read. A list that is not empty is still worth a look: it is the page asking for something nobody
 * decided the answer to.
 */
export class FakeBackend {
    readonly unexpected: string[] = [];
    /** Every frame the page sent on any socket, oldest first. */
    readonly allFrames: SentFrame[] = [];
    private readonly http = new Map<string, HttpHandler>();
    /** Per socket endpoint, its handlers by frame type. */
    private readonly socketTables = new Map<string, Map<string, SocketHandler>>();
    private readonly openSockets = new Map<WebSocketRoute, string>();
    private readonly connectionCounts = new Map<string, number>();
    /** The device id the page registered with — the guest's name everywhere the relay echoes it. */
    deviceId = '';

    private constructor() {
        this.useHttp(guestHttp(this));
        this.useSocket(guestSocket(this));
    }

    static async install(page: Page): Promise<FakeBackend> {
        const backend = new FakeBackend();
        // Everything but the page's own server. A RegExp, not a predicate function: Playwright can only
        // hand a serializable pattern to the browser, and with a function it intercepts every request
        // and asks this process about each — every one of the thousand modules Vite serves the app as.
        await page.route(new RegExp(`^(?!${escapeRegExp(E2E_BASE_URL)}/)`), route => backend.answerHttp(route));
        // Every socket but the dev server's own (Vite's hot reload) is answered here, whatever its host,
        // so a cloud's socket can never reach anything real either.
        const devHost = escapeRegExp(new URL(E2E_BASE_URL).host);
        await page.routeWebSocket(new RegExp(`^wss?://(?!${devHost}/)`), ws => backend.attach(ws));
        return backend;
    }

    /**
     * `'POST /oauth/register-device'` — a path on the relay host; or, for another host such as a
     * cloud's backend, the full address: `'GET https://c1.e2e.test/api/hello/invite-code'`. The query
     * string is ignored either way.
     */
    useHttp(handlers: Record<string, HttpHandler>): void {
        for (const [key, handler] of Object.entries(handlers)) this.http.set(key, handler);
    }

    /**
     * Holds the answer to one HTTP route until `gate` settles, then answers it as before. For a
     * scenario that needs the page to have something before it can get further — the guest login
     * held until a cold-start tap has reached the page, say. It wraps the handler registered when it
     * is called, so a later `useHttp` for the same route replaces the gate along with it.
     */
    gateHttp(key: string, gate: () => Promise<unknown>): void {
        const handler = this.http.get(key);
        if (!handler) throw new Error(`gateHttp: no handler for ${key}`);
        this.http.set(key, async request => {
            await gate();
            return handler(request);
        });
    }

    /** Every frame the page sent on the relay socket, oldest first. */
    get frames(): SentFrame[] {
        return this.allFrames.filter(frame => frame.endpoint === E2E_ENDPOINTS.socket);
    }

    /** The frames of one type the page sent on the relay socket. */
    sent(type: string): SentFrame[] {
        return this.sentAt(E2E_ENDPOINTS.socket, type);
    }

    /** The frames of one type the page sent on the socket opened to `endpoint`. */
    sentAt(endpoint: string, type: string): SentFrame[] {
        return this.allFrames.filter(frame => frame.endpoint === endpoint && frame.type === type);
    }

    /** By frame type, `'chat.feed'`. Registering over a default changes the relay's answer. */
    useSocket(handlers: Record<string, SocketHandler>): void {
        this.useSocketAt(E2E_ENDPOINTS.socket, handlers);
    }

    /** Handlers for another socket — a cloud's, opened to the `wss` address its invite or token names. */
    useSocketAt(endpoint: string, handlers: Record<string, SocketHandler>): void {
        let table = this.socketTables.get(endpoint);
        if (!table) {
            table = new Map();
            this.socketTables.set(endpoint, table);
        }
        for (const [type, handler] of Object.entries(handlers)) table.set(type, handler);
    }

    /**
     * The handler the relay socket answers `type` with now, so a scenario can wrap it — hold the
     * sign-in on a reconnect, say — rather than restate what it answers.
     */
    handlerOf(type: string): SocketHandler {
        const handler = this.socketTables.get(E2E_ENDPOINTS.socket)?.get(type);
        if (!handler) throw new Error(`handlerOf: no handler for ${type}`);
        return handler;
    }

    /** How many times the page has opened the relay socket. A reconnect is the second. */
    get connections(): number {
        return this.connectionCounts.get(E2E_ENDPOINTS.socket) ?? 0;
    }

    /**
     * Closes every open relay socket from the relay's side — what the page finds when the server or the
     * network dropped the connection while the app was suspended. The page's own reconnect is what a
     * scenario then watches for (`connections`).
     */
    async dropSockets(): Promise<void> {
        const relay = [...this.openSockets].filter(([, endpoint]) => endpoint === E2E_ENDPOINTS.socket);
        for (const [ws] of relay) this.openSockets.delete(ws);
        await Promise.all(relay.map(([ws]) => ws.close({ code: 1001, reason: 'e2e: dropped by the relay' })));
    }

    private async answerHttp(route: Route): Promise<void> {
        const request = route.request();
        const url = new URL(request.url());
        // `index.html` links its font from Google. An empty stylesheet keeps the page off the network
        // and its layout on the fallback font, which is the same on every run.
        if (url.hostname === 'fonts.googleapis.com') {
            return route.fulfill({ contentType: 'text/css', body: '' });
        }
        const relay = new URL(E2E_ENDPOINTS.relay);
        const onRelay = url.origin === relay.origin && url.pathname.startsWith(relay.pathname);
        const handler =
            this.http.get(`${request.method()} ${url.origin}${url.pathname}`) ??
            (onRelay ? this.http.get(`${request.method()} ${url.pathname.slice(relay.pathname.length)}`) : undefined);
        if (!handler) {
            this.unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
            return route.abort();
        }
        try {
            return await route.fulfill({ json: await handler(request) });
        } catch (error) {
            return route.fulfill({ status: 500, json: { message: String(error) } });
        }
    }

    private attach(ws: WebSocketRoute): void {
        // The longest registered endpoint the address starts with, so one endpoint can sit under another.
        const endpoint = [...this.socketTables.keys()]
            .filter(candidate => ws.url().startsWith(candidate))
            .sort((a, b) => b.length - a.length)[0];
        if (!endpoint) {
            this.unexpected.push(`socket connect ${ws.url().split('?')[0]}`);
            void ws.close({ code: 1008, reason: 'e2e: no fixture for this socket' });
            return;
        }
        const table = this.socketTables.get(endpoint) as Map<string, SocketHandler>;
        const connection = (this.connectionCounts.get(endpoint) ?? 0) + 1;
        this.connectionCounts.set(endpoint, connection);
        this.openSockets.set(ws, endpoint);
        ws.onClose(() => this.openSockets.delete(ws));
        ws.onMessage(raw => {
            let frame: SocketFrame;
            try {
                frame = JSON.parse(String(raw)) as SocketFrame;
            } catch {
                return;
            }
            this.allFrames.push({ ...frame, endpoint, connection });
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
                // A frame without a `mid` expects no reply when its handler has nothing to say (`device.sync`).
                if (data === undefined && !frame.mid) return;
                reply({ type: `${frame.type}:ok`, data: data ?? null });
            };
            let data: unknown;
            try {
                data = handler(frame.data, frame);
            } catch (error) {
                refuse(error);
                return;
            }
            if (!(data instanceof Promise)) {
                answer(data);
                return;
            }
            // A held answer can outlive the socket it was asked on; Playwright drops a send on a closed
            // socket, as the relay's own connection would.
            void data.then(answer, refuse);
        });
    }
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What a first launch asks the relay over HTTP: a guest login, its membership, and its clouds (none). */
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

/**
 * The socket's half: signing the socket in, the guest's profile, and the one room a new guest has —
 * the self chat in the relay place, empty.
 */
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
    // The web switches the socket into the place it shows; the answer is the token for that place.
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
