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

/** One socket request's answer: the data of its `:ok` frame. */
export type SocketHandler = (data: unknown, frame: SocketFrame) => unknown;

/**
 * The relay — its HTTP API and its socket — answered from fixtures, so no scenario depends on a
 * server being up or on what it holds.
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
    /** Every frame the page sent on the socket, oldest first. */
    readonly frames: SocketFrame[] = [];
    private readonly http = new Map<string, HttpHandler>();
    private readonly socket = new Map<string, SocketHandler>();
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
        await page.routeWebSocket(new RegExp(`^${escapeRegExp(E2E_ENDPOINTS.socket)}`), ws => backend.attach(ws));
        return backend;
    }

    /** `'POST /oauth/register-device'` — a path on the relay host; the query string is ignored. */
    useHttp(handlers: Record<string, HttpHandler>): void {
        for (const [key, handler] of Object.entries(handlers)) this.http.set(key, handler);
    }

    /** The frames of one type the page sent. */
    sent(type: string): SocketFrame[] {
        return this.frames.filter(frame => frame.type === type);
    }

    /** By frame type, `'chat.feed'`. Registering over a default changes the relay's answer. */
    useSocket(handlers: Record<string, SocketHandler>): void {
        for (const [type, handler] of Object.entries(handlers)) this.socket.set(type, handler);
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
        const handler =
            url.origin === relay.origin && url.pathname.startsWith(relay.pathname)
                ? this.http.get(`${request.method()} ${url.pathname.slice(relay.pathname.length)}`)
                : undefined;
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
        ws.onMessage(raw => {
            let frame: SocketFrame;
            try {
                frame = JSON.parse(String(raw)) as SocketFrame;
            } catch {
                return;
            }
            this.frames.push(frame);
            const meta = { ts: Date.now() };
            const handler = this.socket.get(frame.type);
            if (!handler) {
                this.unexpected.push(`socket ${frame.type}`);
                if (frame.mid) {
                    ws.send(
                        JSON.stringify({
                            type: `${frame.type}:error`,
                            data: null,
                            mid: frame.mid,
                            meta,
                            error: 'no fixture',
                        })
                    );
                }
                return;
            }
            const data = handler(frame.data, frame);
            if (data === NO_REPLY) return;
            // A frame without a `mid` expects no reply when its handler has nothing to say (`device.sync`).
            if (data === undefined && !frame.mid) return;
            ws.send(JSON.stringify({ type: `${frame.type}:ok`, data: data ?? null, mid: frame.mid, meta }));
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
