import type {
    AppMessageError,
    OnRuntimeEventPayload,
    OnRuntimeSessionChangedPayload,
    OnSubWebViewRuntimeHelloPayload,
    RuntimeWireValue,
    SubWebViewRuntimeErrorCode,
    SubWebViewRuntimePermission,
    SubWebViewRuntimeRequestType,
    WebMessageData,
    WebMessageHandlerResponse,
} from '@chatic/bridge-messages';
import type { IAppBridgeHost } from '@chatic/bridges';
import { checkSubWebViewRuntimeRequest, createRuntimeBridgeHost, subWebViewAllowedFor } from '@chatic/runtime-mobile';
import type { RuntimeBridgeHost, RuntimeHostAnswer } from '@chatic/runtime-mobile';

import type { SubWebViewRuntimeAccess } from './subWebViewRuntimeAccess';

import type { SubWebViewReadBudget } from './subWebViewReadBudget';
import type { SubWebViewRuntimeConsent } from './subWebViewRuntimeConsent';
import { cloudOfSession } from './subWebViewRuntimeGate';

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
export const sessionForPage = (snapshot: ReturnType<SubWebViewRuntimeSession['snapshot']>) => ({
    context: {
        cloud: {
            cloudId: snapshot.context.cloud.cloudId,
            siteId: snapshot.context.cloud.siteId,
            isActive: snapshot.context.cloud.isActive,
        },
        identity: {
            userId: snapshot.context.identity.userId,
            isAuthenticated: snapshot.context.identity.isAuthenticated,
        },
    },
    committedSiteId: snapshot.committedSiteId,
});

export interface SubWebViewRuntimeBridgeDeps {
    /** The app's runtime host for this page load, built over `send` (`createRuntimeBridgeHost`). */
    createHost: (send: {
        event(payload: OnRuntimeEventPayload): void;
        sessionChanged(payload: OnRuntimeSessionChangedPayload): void;
    }) => RuntimeBridgeHost;
    session: SubWebViewRuntimeSession;
    /** The cloud selected when the view opened; the page reads it and nothing else. */
    openedCloudId: string;
    /** What the gate granted: never empty here. */
    granted: ReadonlySet<SubWebViewRuntimePermission>;
    /** The origin the view was opened on, for consent. */
    origin: string;
    /** The page host to push to, or `null` once its page load is over: nothing reaches the next one. */
    pageHost: () => Pick<IAppBridgeHost, 'pushEvent'> | null;
    consent: SubWebViewRuntimeConsent;
    budget: SubWebViewReadBudget;
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
 * 4. for a read that asks the server, the view's budget, else `RATE_LIMITED` with `retryAfterMs`.
 *
 * Then the request goes to the app's runtime unchanged, and its answer comes back unchanged.
 *
 * The runtime host is this page load's own, so the page's streams are apart from the main web's and
 * end with the load. Its hello settles nothing: it reports the main web's owner, the contract, and
 * what this page may use; with `session`, the current cloud's part of the session (`sessionForPage`).
 */
export const createSubWebViewRuntimeBridge = ({
    createHost,
    session,
    openedCloudId,
    granted,
    origin,
    pageHost,
    consent,
    budget,
    now = Date.now,
    onRefused,
}: SubWebViewRuntimeBridgeDeps): { handlers: SubWebViewRuntimeHandlers; dispose(): void } => {
    // The last event number of each open stream, so the stream the cloud change ends gets the next one.
    const open = new Map<string, number>();
    // Subscribes past the stream check and still being admitted: they count toward the cap, or a burst
    // of them sent at once would all pass it while the first waits for consent.
    const admitting = new Set<string>();
    let cloudChanged = false;

    const host = createHost({
        event: payload => {
            if (cloudChanged || !open.has(payload.subscriptionId)) return;
            if (isEnded(payload.event)) open.delete(payload.subscriptionId);
            else open.set(payload.subscriptionId, payload.seq);
            pageHost()?.pushEvent({ type: 'OnRuntimeEvent', success: true, data: payload });
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
            pageHost()?.pushEvent({
                type: 'OnRuntimeEvent',
                success: true,
                data: { subscriptionId, seq: seq + 1, event: { $ended: CLOUD_CHANGED } as never },
            });
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
        if ((await consent.ensure({ userId, origin, cloudId: openedCloudId }, granted)) === 'refused') {
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
        const check = checkSubWebViewRuntimeRequest({ kind, target, method, args }, granted, {
            cloudId: currentCloud(),
            placeId: session.snapshot().committedSiteId,
        });
        if (!check.ok) {
            onRefused?.({ target, method, code: 'RUNTIME_NOT_ALLOWED', reason: check.reason });
            return error('RUNTIME_NOT_ALLOWED', `${target}.${method} is not open to this page (${check.reason})`, {
                target,
                method,
                reason: check.reason,
            });
        }
        const refused = await ask();
        if (refused) return refused;
        if (check.entry.cost === 'server') {
            const spent = budget.take(now());
            if (!spent.ok) {
                onRefused?.({ target, method, code: 'RATE_LIMITED' });
                return error('RATE_LIMITED', 'Too many server reads from this view.', {
                    retryAfterMs: spent.retryAfterMs,
                });
            }
        }
        return null;
    };

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
            return reply('RuntimeCall', await host.call({ target, method, args }));
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
            if (cloudChanged) return reply('RuntimeUnsubscribe', { value: {} });
            return reply('RuntimeUnsubscribe', host.unsubscribe({ subscriptionId }));
        },
    };

    return {
        handlers,
        dispose: () => {
            stopWatching();
            open.clear();
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
        granted: access.granted,
        origin,
        pageHost,
        consent: access.consent,
        budget: access.budget,
        onRefused,
    });
