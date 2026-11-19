import type {
    AppMessageError,
    OnRuntimeEventPayload,
    OnRuntimeSessionChangedPayload,
    OnSubWebViewRuntimeHelloPayload,
    RuntimeWireValue,
    SubWebViewRuntimeErrorCode,
    SubWebViewRuntimePermission,
    SubWebViewRuntimeRefusalReason,
    SubWebViewRuntimeRequestType,
    WebMessageData,
    WebMessageHandlerResponse,
} from '@chatic/bridge-messages';
import type { IAppBridgeHost } from '@chatic/bridges';
import { AppState } from 'react-native';
import {
    SUB_WEB_VIEW_ALLOWED,
    checkSubWebViewRuntimeRequest,
    createRuntimeBridgeHost,
    subWebViewAllowedFor,
} from '@chatic/runtime-mobile';
import type { RuntimeBridgeHost, RuntimeHostAnswer } from '@chatic/runtime-mobile';

import type { SubWebViewRuntimeAccess } from './subWebViewRuntimeAccess';

import type { SubWebViewReadBudget } from './subWebViewReadBudget';
import type { SubWebViewRuntimeConsent } from './subWebViewRuntimeConsent';
import { cloudOfSession, placeOfSession } from './subWebViewRuntimeGate';

/** How many streams one page load may hold open; the next subscribe fails `INVALID`. */
export const SUB_WEBVIEW_STREAMS_PER_LOAD = 16;

/** One handler per runtime request, written for the sub host. */
export type SubWebViewRuntimeHandlers = {
    [K in SubWebViewRuntimeRequestType]: (message: WebMessageData<K>) => Promise<WebMessageHandlerResponse<K>>;
};

/** The session as this bridge reads it: the cloud it is on, whose it is, and its changes. */
export interface SubWebViewRuntimeSession {
    snapshot(): {
        context: {
            cloud: { cloudId: string | null; siteId: string | null; isActive: boolean };
            identity: { userId: string | null; isAuthenticated: boolean };
        };
        committedSiteId: string | null;
    };
    subscribe(listener: () => void): () => void;
}

/**
 * What a page with `session` gets of the session: this cloud's half and who the user is in it, under
 * the snapshot's own paths. Not the whole snapshot: that is the account's, and holds the user's other
 * clouds (`uidByCloud`, the paired clouds), the relay account and the device's guest id — and a page
 * reads the current cloud only. Nor the cloud's server addresses, which a page has no use for.
 */
// Home is shown to the page as the cloud `default` on the relay's place, as the gate reads it, so a
// page reads the same cloud and place on Home as anywhere else.
export const sessionForPage = (snapshot: ReturnType<SubWebViewRuntimeSession['snapshot']>) => ({
    context: {
        cloud: {
            cloudId: cloudOfSession(snapshot),
            siteId: snapshot.context.cloud.cloudId ? snapshot.context.cloud.siteId : placeOfSession(snapshot),
            isActive: snapshot.context.cloud.isActive,
        },
        identity: {
            userId: snapshot.context.identity.userId,
            isAuthenticated: snapshot.context.identity.isAuthenticated,
        },
    },
    committedSiteId: placeOfSession(snapshot),
});

/** Whether the page can be reached: the app in front. */
export interface SubWebViewVisibility {
    hidden(): boolean;
    /** Hears each change; returns the function that stops it. */
    onChange(listener: () => void): () => void;
}

/**
 * The app's own: hidden while the app is in the background, where Android delivers nothing to the page.
 * Not while it is `inactive` — a system prompt, the app switcher — which passes in a moment.
 */
export const appSubWebViewVisibility: SubWebViewVisibility = {
    hidden: () => AppState.currentState === 'background',
    onChange: listener => {
        const subscription = AppState.addEventListener('change', listener);
        return () => subscription.remove();
    },
};

export interface SubWebViewRuntimeBridgeDeps {
    /** The app's runtime host for this page load, built over `send` (`createRuntimeBridgeHost`). */
    createHost: (send: {
        event(payload: OnRuntimeEventPayload): void;
        sessionChanged(payload: OnRuntimeSessionChangedPayload): void;
    }) => RuntimeBridgeHost;
    session: SubWebViewRuntimeSession;
    /** The cloud selected when the view opened; the page reads it and nothing else. */
    openedCloudId: string;
    /**
     * The place the session was on when the view opened. A page with `chatSend` sends to its rooms
     * only, and is asked about, and allowed, in that place alone.
     */
    openedPlaceId: string | null;
    /** What the gate granted: never empty here. */
    granted: ReadonlySet<SubWebViewRuntimePermission>;
    /** The origin the view was opened on, for consent. */
    origin: string;
    /** The page host to push to, or `null` once its page load is over: nothing reaches the next one. */
    pageHost: () => Pick<IAppBridgeHost, 'pushEvent'> | null;
    consent: SubWebViewRuntimeConsent;
    /** The view's server reads. */
    budget: SubWebViewReadBudget;
    /** The view's messages sent, apart from its reads: a page that reads hard can still send. */
    sends: SubWebViewReadBudget;
    /** The view's reads of the device cache, apart from its server reads and its sends. */
    cacheReads: SubWebViewReadBudget;
    /**
     * Whether the page can be reached now. While it cannot, each stream keeps only its latest event,
     * delivered when it can again. Absent, the page is always reachable.
     */
    visibility?: SubWebViewVisibility;
    now?: () => number;
    /** Hears each refusal, for the app's log. */
    onRefused?: (refusal: { target: string; method: string; code: string; reason?: string }) => void;
}

const RESPONSE = {
    RuntimeHello: 'OnRuntimeHello',
    RuntimeCall: 'OnRuntimeCall',
    RuntimeSubscribe: 'OnRuntimeSubscribe',
    RuntimeUnsubscribe: 'OnRuntimeUnsubscribe',
} as const;

const reply = <K extends SubWebViewRuntimeRequestType>(
    type: K,
    answer: RuntimeHostAnswer<unknown>
): WebMessageHandlerResponse<K> =>
    ('failure' in answer
        ? { type: RESPONSE[type], success: false, error: answer.failure }
        : { type: RESPONSE[type], success: true, data: answer.value }) as WebMessageHandlerResponse<K>;

const refuse = <K extends SubWebViewRuntimeRequestType>(
    type: K,
    error: AppMessageError
): WebMessageHandlerResponse<K> => reply(type, { failure: error });

const error = (code: SubWebViewRuntimeErrorCode | 'INVALID', message: string, details?: unknown): AppMessageError =>
    details === undefined ? { code, message } : { code, message, details };

const CLOUD_CHANGED: AppMessageError = error(
    'CLOUD_CHANGED',
    'The cloud this view opened on is no longer the selected one.'
);

const isEnded = (event: RuntimeWireValue): boolean =>
    event !== null && typeof event === 'object' && !Array.isArray(event) && '$ended' in event;

const isString = (value: unknown): value is string => typeof value === 'string' && value !== '';

const fieldOf = (args: readonly RuntimeWireValue[], at: { arg: number; field?: string }): unknown => {
    const argument = args[at.arg];
    if (at.field === undefined) return argument;
    return argument !== null && typeof argument === 'object' && !Array.isArray(argument)
        ? (argument as Record<string, unknown>)[at.field]
        : undefined;
};

/**
 * The four runtime requests on a sub WebView page's host. Each call and subscribe is checked in one
 * order, and the first failure answers:
 *
 * 0. the request's own shape, else `INVALID` — and for a subscribe, room for one more stream, counting
 *    the ones still being admitted, else `INVALID`;
 * 1. the view's cloud is still the session's, else `CLOUD_CHANGED` — and once it is not, every open
 *    stream ends with it and nothing answers again;
 * 2. the whitelist: the target, the method and the way it is asked, the permission, the argument
 *    guards (`checkSubWebViewRuntimeRequest`), else `RUNTIME_NOT_ALLOWED` with the reason;
 * 3. the user's consent for this page in this cloud, else `CONSENT_REFUSED`;
 * 4. for a read of the device cache, the view's cache budget, else `RATE_LIMITED` — and one more read
 *    of it for each room the next check reads, so a refused read costs the app nothing more;
 * 5. for a message and a room's reads, the room: one this device holds, in the cloud and the place the
 *    view opened on — and the session still on that place — read from the device cache, else
 *    `RUNTIME_NOT_ALLOWED` with `guard` (a failure of the read itself passes through as the runtime
 *    answered it);
 * 6. for a read that asks the server, the view's read budget, and for a message its send budget, else
 *    `RATE_LIMITED` with `retryAfterMs`.
 *
 * Then the request goes to the app's runtime unchanged, and its answer comes back unchanged — unless
 * the view closed or its cloud changed while the checks waited: nothing is sent past either.
 *
 * While the page cannot be reached (`visibility`), each stream keeps only its latest event — every
 * stream the whitelist opens sends the whole of what it watches each time, never a change, so the last
 * one stands for the ones before it — and a stream's end replaces whatever it held. They go out in the
 * order they last changed, once the page can be reached again.
 *
 * The runtime host is this page load's own, so the page's streams are apart from the main web's and
 * end with the load. Its hello settles nothing: it reports the main web's owner, the contract, and
 * what this page may use; with `session`, the current cloud's part of the session (`sessionForPage`).
 */
export const createSubWebViewRuntimeBridge = ({
    createHost,
    session,
    openedCloudId,
    openedPlaceId,
    granted,
    origin,
    pageHost,
    consent,
    budget,
    sends,
    cacheReads,
    visibility,
    now = Date.now,
    onRefused,
}: SubWebViewRuntimeBridgeDeps): { handlers: SubWebViewRuntimeHandlers; dispose(): void } => {
    // The last event number of each open stream, so the stream the cloud change ends gets the next one.
    const open = new Map<string, number>();
    // Subscribes past the stream check and still being admitted: they count toward the cap, or a burst
    // of them sent at once would all pass it while the first waits for consent.
    const admitting = new Set<string>();
    let cloudChanged = false;
    // Set once the view's page load is over: a request still in its checks then goes nowhere.
    let disposed = false;
    // Each stream's latest event while the page cannot be reached, in the order they last changed.
    const held = new Map<string, OnRuntimeEventPayload>();

    const deliver = (payload: OnRuntimeEventPayload) => {
        if (visibility?.hidden()) {
            held.delete(payload.subscriptionId);
            held.set(payload.subscriptionId, payload);
            return;
        }
        pageHost()?.pushEvent({ type: 'OnRuntimeEvent', success: true, data: payload });
    };

    const release = () => {
        if (visibility?.hidden() || held.size === 0) return;
        const due = [...held.values()];
        held.clear();
        due.forEach(payload => pageHost()?.pushEvent({ type: 'OnRuntimeEvent', success: true, data: payload }));
    };
    const stopHearingVisibility = visibility?.onChange(release) ?? (() => undefined);

    const host = createHost({
        event: payload => {
            if (cloudChanged || !open.has(payload.subscriptionId)) return;
            if (isEnded(payload.event)) open.delete(payload.subscriptionId);
            else open.set(payload.subscriptionId, payload.seq);
            deliver(payload);
        },
        sessionChanged: payload => {
            if (cloudChanged || !granted.has('session')) return;
            pageHost()?.pushEvent({
                type: 'OnRuntimeSessionChanged',
                success: true,
                data: { ...payload, session: sessionForPage(session.snapshot()) },
            });
        },
    });

    const currentCloud = () => cloudOfSession(session.snapshot());

    const endForCloud = () => {
        if (cloudChanged) return;
        cloudChanged = true;
        open.forEach((seq, subscriptionId) => {
            host.unsubscribe({ subscriptionId });
            deliver({ subscriptionId, seq: seq + 1, event: { $ended: CLOUD_CHANGED } as never });
        });
        open.clear();
        host.dispose();
    };

    const cloudStillOpen = (): boolean => {
        if (!cloudChanged && currentCloud() !== openedCloudId) endForCloud();
        return !cloudChanged;
    };

    const stopWatching = session.subscribe(() => void cloudStillOpen());

    const ask = async (): Promise<AppMessageError | null> => {
        const userId = session.snapshot().context.identity.userId ?? '';
        // Allowed per place: a yes in one place reads and posts nothing in another.
        const placeId = openedPlaceId ?? '';
        if ((await consent.ensure({ userId, origin, cloudId: openedCloudId, placeId }, granted)) === 'refused') {
            return error('CONSENT_REFUSED', 'The user did not allow this page to read this cloud.');
        }
        // The question can stay up for a while; the cloud may have changed under it.
        return cloudStillOpen() ? null : CLOUD_CHANGED;
    };

    /** The checks before the runtime is asked; `null` when the request may go. */
    const admit = async (
        kind: 'call' | 'stream',
        target: string,
        method: string,
        args: RuntimeWireValue[]
    ): Promise<AppMessageError | null> => {
        if (!cloudStillOpen()) return CLOUD_CHANGED;
        // A place's reads answer only for the place the view opened on, and only while the session is
        // still on it: once the user moved, nothing of a place is read until a new view opens.
        const check = checkSubWebViewRuntimeRequest({ kind, target, method, args }, granted, {
            cloudId: currentCloud(),
            placeId: onOpenedPlace() ? openedPlaceId : null,
        });
        const notAllowed = (reason: SubWebViewRuntimeRefusalReason) => {
            onRefused?.({ target, method, code: 'RUNTIME_NOT_ALLOWED', reason });
            return error('RUNTIME_NOT_ALLOWED', `${target}.${method} is not open to this page (${reason})`, {
                target,
                method,
                reason,
            });
        };
        if (!check.ok) return notAllowed(check.reason);
        const refused = await ask();
        if (refused) return refused;
        if (check.entry.cost === 'local') {
            const over = spendCacheRead(target, method);
            if (over) return over;
        }
        if (check.entry.roomInCurrentPlace) {
            const at = check.entry.roomInCurrentPlace;
            const named = fieldOf(args, at);
            const rooms = at.each ? named : [named];
            if (!Array.isArray(rooms)) return notAllowed('guard');
            for (const roomId of rooms) {
                const room = await roomOfPlace(target, method, roomId);
                if (room === 'notHere') return notAllowed('guard');
                if (room !== 'here') return room;
            }
        }
        const spending = check.entry.cost === 'server' ? budget : check.entry.cost === 'send' ? sends : null;
        if (spending) {
            const spent = spending.take(now());
            if (!spent.ok) {
                onRefused?.({ target, method, code: 'RATE_LIMITED' });
                const what = spending === sends ? 'messages' : 'server reads';
                return error('RATE_LIMITED', `Too many ${what} from this view.`, { retryAfterMs: spent.retryAfterMs });
            }
        }
        return null;
    };

    const onOpenedPlace = () => openedPlaceId !== null && placeOfSession(session.snapshot()) === openedPlaceId;

    /**
     * Whether a room is one of the place the view opened on, in its cloud, with the session still on
     * that place: the room as this device holds it, read through the page load's own runtime host like
     * any other read. A room the device does not hold — one the user left, or never joined — is not.
     * A read that fails answers its own failure, so the page learns the runtime's reason, not a guard.
     */
    /**
     * Spends one read of the view's cache budget, or answers `RATE_LIMITED`. Every cache read the shell
     * makes for a page counts — the page's own and the room checks it makes on the page's behalf, one per
     * room — so neither a long list of rooms nor a loop of sends to rooms that are not there reads the
     * cache for free.
     */
    const spendCacheRead = (target: string, method: string): AppMessageError | null => {
        const spent = cacheReads.take(now());
        if (spent.ok) return null;
        onRefused?.({ target, method, code: 'RATE_LIMITED' });
        return error('RATE_LIMITED', 'Too many cache reads from this view.', { retryAfterMs: spent.retryAfterMs });
    };

    const roomOfPlace = async (
        target: string,
        method: string,
        roomId: unknown
    ): Promise<'here' | 'notHere' | AppMessageError> => {
        if (!isString(roomId) || !onOpenedPlace()) return 'notHere';
        const over = spendCacheRead(target, method);
        if (over) return over;
        const answer = await host.call({ target, method: 'channel.cacheRead', args: [roomId] });
        if ('failure' in answer) return answer.failure;
        if (!cloudStillOpen()) return CLOUD_CHANGED;
        const room = answer.value.value as { id?: unknown; cid?: unknown; sid?: unknown } | null;
        return !!room &&
            room.id === roomId &&
            room.cid === openedCloudId &&
            room.sid === openedPlaceId &&
            onOpenedPlace()
            ? 'here'
            : 'notHere';
    };

    const VIEW_CLOSED: AppMessageError = { code: 'RUNTIME_NOT_STARTED', message: 'the view has closed' };

    const invalid = (what: string) => error('INVALID', `${what} is missing or malformed`);

    const handlers: SubWebViewRuntimeHandlers = {
        RuntimeHello: async message => {
            if (!cloudStillOpen()) return refuse('RuntimeHello', CLOUD_CHANGED);
            const refused = await ask();
            if (refused) return refuse('RuntimeHello', refused);
            const answer = await host.hello(message.data);
            if ('failure' in answer) return reply('RuntimeHello', answer);
            if (answer.value.sessionOwner !== 'native') {
                // The gate registers this host only where the runtime runs; a `web` answer means it
                // could not start, and the page has nothing to read.
                return refuse('RuntimeHello', { code: 'RUNTIME_NOT_STARTED', message: 'the runtime is not running' });
            }
            // A hello is a new document: the runtime host ended the last one's streams.
            open.clear();
            held.clear();
            const hello: OnSubWebViewRuntimeHelloPayload = {
                sessionOwner: 'native',
                contract: answer.value.contract,
                seq: answer.value.seq,
                session: granted.has('session') ? sessionForPage(session.snapshot()) : null,
                allowed: subWebViewAllowedFor(granted),
            };
            return reply('RuntimeHello', { value: hello });
        },
        RuntimeCall: async message => {
            const { target, method, args } = message.data ?? {};
            if (!isString(target) || !isString(method) || !Array.isArray(args)) {
                return refuse('RuntimeCall', invalid('target, method or args'));
            }
            const refused = await admit('call', target, method, args);
            if (refused) return refuse('RuntimeCall', refused);
            // The checks can wait on the user and on the cache: what changed meanwhile is checked again
            // here, right before the runtime acts — a message must not go out from a closed view.
            if (disposed) return refuse('RuntimeCall', VIEW_CLOSED);
            if (!cloudStillOpen()) return refuse('RuntimeCall', CLOUD_CHANGED);
            const answer = await host.call({ target, method, args });
            const answerRoom = SUB_WEB_VIEW_ALLOWED.get(method)?.answerRoomInCurrentPlace;
            if (answerRoom && !('failure' in answer)) {
                // A read by an id that names no room: the room is known only from what it answered.
                const row = answer.value.value as Record<string, unknown> | null;
                if (row !== null && typeof row === 'object') {
                    const room = await roomOfPlace(target, method, row[answerRoom.field]);
                    if (room === 'notHere') {
                        onRefused?.({ target, method, code: 'RUNTIME_NOT_ALLOWED', reason: 'guard' });
                        return refuse(
                            'RuntimeCall',
                            error('RUNTIME_NOT_ALLOWED', `${target}.${method} is not open to this page (guard)`, {
                                target,
                                method,
                                reason: 'guard',
                            })
                        );
                    }
                    if (room !== 'here') return refuse('RuntimeCall', room);
                }
            }
            return reply('RuntimeCall', answer);
        },
        RuntimeSubscribe: async message => {
            const { subscriptionId, target, topic, args } = message.data ?? {};
            if (!isString(subscriptionId) || !isString(target) || !isString(topic) || !Array.isArray(args)) {
                return refuse('RuntimeSubscribe', invalid('subscriptionId, target, topic or args'));
            }
            const replacing = open.has(subscriptionId) || admitting.has(subscriptionId);
            if (!replacing && open.size + admitting.size >= SUB_WEBVIEW_STREAMS_PER_LOAD) {
                return refuse(
                    'RuntimeSubscribe',
                    error('INVALID', `A page load holds at most ${SUB_WEBVIEW_STREAMS_PER_LOAD} streams.`)
                );
            }
            admitting.add(subscriptionId);
            let refused: AppMessageError | null;
            try {
                refused = await admit('stream', target, topic, args);
            } finally {
                admitting.delete(subscriptionId);
            }
            if (refused) return refuse('RuntimeSubscribe', refused);
            const wasOpen = open.has(subscriptionId);
            // Listed before the runtime is asked: the first event can arrive during the subscribing call.
            open.set(subscriptionId, open.get(subscriptionId) ?? 0);
            const answer = await host.subscribe({ subscriptionId, target, topic, args });
            // A replacement the runtime refused leaves the stream it would have replaced running, so
            // only a new id is forgotten.
            if ('failure' in answer && !wasOpen) open.delete(subscriptionId);
            return reply('RuntimeSubscribe', answer);
        },
        RuntimeUnsubscribe: async message => {
            const subscriptionId = message.data?.subscriptionId;
            if (!isString(subscriptionId)) return refuse('RuntimeUnsubscribe', invalid('subscriptionId'));
            open.delete(subscriptionId);
            held.delete(subscriptionId);
            if (cloudChanged) return reply('RuntimeUnsubscribe', { value: {} });
            return reply('RuntimeUnsubscribe', host.unsubscribe({ subscriptionId }));
        },
    };

    return {
        handlers,
        dispose: () => {
            disposed = true;
            stopWatching();
            stopHearingVisibility();
            open.clear();
            held.clear();
            if (!cloudChanged) host.dispose();
        },
    };
};

/**
 * The bridge as the view builds it, over the app's engine and the access the gate settled. Here rather
 * than in the view so the runtime package is reached only through this module, which the view loads
 * only when the gate opened the runtime.
 */
export const createAppSubWebViewRuntimeBridge = ({
    access,
    origin,
    pageHost,
    onRefused,
}: {
    access: SubWebViewRuntimeAccess;
    origin: string;
    pageHost: SubWebViewRuntimeBridgeDeps['pageHost'];
    onRefused?: SubWebViewRuntimeBridgeDeps['onRefused'];
}) =>
    createSubWebViewRuntimeBridge({
        createHost: send => createRuntimeBridgeHost({ engine: async () => access.engine, send }),
        session: access.engine.session,
        openedCloudId: access.openedCloudId,
        openedPlaceId: access.openedPlaceId,
        granted: access.granted,
        origin,
        pageHost,
        consent: access.consent,
        budget: access.budget,
        sends: access.sends,
        cacheReads: access.cacheReads,
        visibility: appSubWebViewVisibility,
        onRefused,
    });
