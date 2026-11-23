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

export const SUB_WEBVIEW_STREAMS_PER_LOAD = 16;

export type SubWebViewRuntimeHandlers = {
    [K in SubWebViewRuntimeRequestType]: (message: WebMessageData<K>) => Promise<WebMessageHandlerResponse<K>>;
};

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

export interface SubWebViewVisibility {
    hidden(): boolean;
    onChange(listener: () => void): () => void;
}

export const appSubWebViewVisibility: SubWebViewVisibility = {
    hidden: () => AppState.currentState === 'background',
    onChange: listener => {
        const subscription = AppState.addEventListener('change', listener);
        return () => subscription.remove();
    },
};

export interface SubWebViewRuntimeBridgeDeps {
    createHost: (send: {
        event(payload: OnRuntimeEventPayload): void;
        sessionChanged(payload: OnRuntimeSessionChangedPayload): void;
    }) => RuntimeBridgeHost;
    session: SubWebViewRuntimeSession;
    openedCloudId: string;
    openedPlaceId: string | null;
    granted: ReadonlySet<SubWebViewRuntimePermission>;
    origin: string;
    pageHost: () => Pick<IAppBridgeHost, 'pushEvent'> | null;
    consent: SubWebViewRuntimeConsent;
    budget: SubWebViewReadBudget;
    sends: SubWebViewReadBudget;
    cacheReads: SubWebViewReadBudget;
    visibility?: SubWebViewVisibility;
    reactions: SubWebViewReadBudget;
    now?: () => number;
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
    reactions,
    now = Date.now,
    onRefused,
}: SubWebViewRuntimeBridgeDeps): { handlers: SubWebViewRuntimeHandlers; dispose(): void } => {
    const open = new Map<string, number>();
    const admitting = new Set<string>();
    let cloudChanged = false;
    let disposed = false;
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
        const placeId = openedPlaceId ?? '';
        if ((await consent.ensure({ userId, origin, cloudId: openedCloudId, placeId }, granted)) === 'refused') {
            return error('CONSENT_REFUSED', 'The user did not allow this page to read this cloud.');
        }
        return cloudStillOpen() ? null : CLOUD_CHANGED;
    };

    const admit = async (
        kind: 'call' | 'stream',
        target: string,
        method: string,
        args: RuntimeWireValue[]
    ): Promise<AppMessageError | null> => {
        if (!cloudStillOpen()) return CLOUD_CHANGED;
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
        if (check.entry.messageInCurrentPlace) {
            const spent = reactions.take(now());
            if (!spent.ok) {
                onRefused?.({ target, method, code: 'RATE_LIMITED' });
                return error('RATE_LIMITED', 'Too many reactions from this view.', {
                    retryAfterMs: spent.retryAfterMs,
                });
            }
            const chatId = fieldOf(args, check.entry.messageInCurrentPlace);
            if (!isString(chatId) || !onOpenedPlace()) return notAllowed('guard');
            const answer = await host.call({ target, method: 'chat.cacheRead', args: [chatId] });
            if ('failure' in answer) return answer.failure;
            if (!cloudStillOpen()) return CLOUD_CHANGED;
            const message = answer.value.value as {
                id?: unknown;
                channelId?: unknown;
                chatNo?: unknown;
                hidden?: unknown;
                isPending?: unknown;
                isFailed?: unknown;
                subType?: unknown;
            } | null;
            if (
                !message ||
                message.id !== chatId ||
                typeof message.chatNo !== 'number' ||
                message.chatNo <= 0 ||
                message.hidden === true ||
                message.isPending === true ||
                message.isFailed === true ||
                message.subType === 'reaction' ||
                message.subType === 'edit'
            ) {
                return notAllowed('guard');
            }
            const room = await roomOfPlace(target, method, message.channelId);
            if (room === 'notHere') return notAllowed('guard');
            if (room !== 'here') return room;
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
                return refuse('RuntimeHello', { code: 'RUNTIME_NOT_STARTED', message: 'the runtime is not running' });
            }
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
            if (disposed) return refuse('RuntimeCall', VIEW_CLOSED);
            if (!cloudStillOpen()) return refuse('RuntimeCall', CLOUD_CHANGED);
            const answer = await host.call({ target, method, args });
            const answerRoom = SUB_WEB_VIEW_ALLOWED.get(method)?.answerRoomInCurrentPlace;
            if (answerRoom && !('failure' in answer)) {
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
            open.set(subscriptionId, open.get(subscriptionId) ?? 0);
            const answer = await host.subscribe({ subscriptionId, target, topic, args });
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
        reactions: access.reactions,
        onRefused,
    });
