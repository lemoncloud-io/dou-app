import type { BridgeClient } from './client';
import { ChaticAppsError } from './errors';
import type {
    DataCallArgs,
    DataCallName,
    DataCallResult,
    CloudChat,
    CloudList,
    CloudProfile,
    CloudSession,
    DataStreamArgs,
    DataStreamEvent,
    DataStreamName,
} from './runtimeTypes';

/** The versions of the app's cloud data contract this library speaks, lowest first. */
export const SDK_DATA_CONTRACTS: readonly number[] = [1];

/**
 * Where a stream's listener goes among its arguments. Left out, it goes last — which, for every method
 * `DataStreams` names, is where the app's method takes it, so a typed `subscribe` never needs it. For
 * a method this library does not know yet, put it where that method takes its callback.
 */
export const LISTENER = Object.freeze({ $listener: true as const });

/** The read methods this page may use: `<repository>.<method>` names, as the app reported them. */
export interface DataAllowed {
    calls: string[];
    streams: string[];
}

/** What the app answered `connect()` with. */
export interface DataConnection {
    /** The cloud data contract version this page and the app speak. */
    contract: number;
    allowed: DataAllowed;
}

/** An open stream. */
export interface DataSubscription {
    /** Stops it. Stopping one that already ended is no error. */
    stop(): Promise<void>;
}

/**
 * The current cloud's data — its places, rooms, messages and members, exactly as DoU's own screens
 * read them — and two writes, a text message and a reaction. Only what the page's manifest asks for
 * (`session`, `cloud`, `place`, `channel`, `chat`, `user`, `chatSend`, `chatReact`): the app
 * refuses every other method with `RUNTIME_NOT_ALLOWED`. The app asks the user once, at `connect`,
 * whether this page may read this cloud.
 *
 * Only in the app, and only where the app holds the session itself: `apps.supports('data')`
 * says whether this one does.
 *
 * A method `DataCalls` / `DataStreams` names is typed: its arguments and its answer. Any other
 * name still goes through, answered as `unknown` — an app newer than this library may open more.
 */
/** Hears a stream the app ended, as `subscribe`'s `onEnd`. */
export interface DataStreamOptions {
    onEnd?: (error: ChaticAppsError) => void;
}

export interface ChaticAppsData {
    /** Opens the conversation; later calls answer the same. `CONSENT_REFUSED` if the user said no. */
    connect(): Promise<DataConnection>;
    /** Whether `method` is one this page may call or subscribe to; `false` before `connect`. */
    can(method: DataCallName | DataStreamName | (string & {})): boolean;
    /** Calls a read method and resolves with what it returned. */
    call<M extends DataCallName>(method: M, ...args: DataCallArgs<M>): Promise<DataCallResult<M>>;
    /**
     * A method this library does not know, answered as `T` (`unknown` unless given). Passing `T`
     * explicitly also reaches a known method untyped, as before types existed.
     */
    call<T = unknown, N extends string = string>(
        method: N extends DataCallName | DataStreamName ? never : N,
        ...args: unknown[]
    ): Promise<T>;
    /**
     * Subscribes to an `observe…` method: `listener` gets each event's arguments. `onEnd` hears a stream
     * the app ended — the cloud changed (`CLOUD_CHANGED`), the event was too large, or the page was
     * restored from the back-forward cache (`DISCONNECTED`; subscribe again).
     */
    subscribe<M extends DataStreamName>(
        method: M,
        args: DataStreamArgs<M> | [...DataStreamArgs<M>, typeof LISTENER],
        listener: (...event: DataStreamEvent<M>) => void,
        onEnd?: (error: ChaticAppsError) => void
    ): Promise<DataSubscription>;
    /** A stream this library does not know: its events arrive as `unknown`. */
    subscribe<N extends string>(
        method: N extends DataCallName | DataStreamName ? never : N,
        args: unknown[],
        listener: (...event: unknown[]) => void,
        onEnd?: (error: ChaticAppsError) => void
    ): Promise<DataSubscription>;
    /**
     * Sends a plain text message, in the user's name, to a room of the place the view opened on — a
     * write, with the `chatSend` permission. Resolves with the message as sent. Text only: nothing
     * else a message can carry. `RUNTIME_NOT_ALLOWED` for a room of another place, blank text or text
     * over 1000 characters; `RATE_LIMITED` past the view's send budget. The same as
     * `call('chat.sendChat', { channelId, content: text })`.
     */
    sendMessage(channelId: string, text: string): Promise<CloudChat>;
    /**
     * Adds (`on: true`) or removes (`on: false`) one emoji on a message, in the user's name — the other
     * write, with the `chatReact` permission. Resolves with the message's row, the reaction applied.
     * `emoji` is one character as a person sees it. Removing takes off the user's reaction with that
     * emoji whoever set it, the user's own tap included. `RUNTIME_NOT_ALLOWED` for a message the device
     * does not hold, one of another place, or one the app offers no reaction on; `RATE_LIMITED` past one
     * reaction per 250 ms or 60 a minute. The same as
     * `call('chat.setReaction', { chatId: messageId, emoji, action: on ? 'on' : 'off' })`.
     */
    react(messageId: string, emoji: string, on: boolean): Promise<CloudChat>;
    /**
     * A member's place profile — what they are called in the place this view opened on: mostly the name
     * shown there (`nick`) and a picture — as the device holds it; `null` when it holds none (they have
     * not set one there; fall back to the member's own name). The app keys it `<place id>@<user id>`,
     * and answers only the place the view opened on, while the session is still there. Needs `user` and
     * `session` (for the place): `NOT_SUPPORTED` without `session` or before the session is on a place,
     * `RUNTIME_NOT_ALLOWED` without `user` or once the user moved to another place.
     */
    placeProfile(userId: string): Promise<CloudProfile | null>;
    /** Every place profile the device holds for the place this view opened on — for naming its members. */
    placeProfiles(): Promise<CloudList<CloudProfile> | null>;
    /** Hears a member's place profile, as `placeProfile` reads it, and each change to it. */
    observePlaceProfile(
        userId: string,
        listener: (profile: CloudProfile | null) => void,
        options?: DataStreamOptions
    ): Promise<DataSubscription>;
    /** The user's own place profile: `placeProfile` with the user's id, read off the session. */
    myProfile(): Promise<CloudProfile | null>;
    /** Hears the user's own place profile, as `myProfile` reads it. */
    observeMyProfile(
        listener: (profile: CloudProfile | null) => void,
        options?: DataStreamOptions
    ): Promise<DataSubscription>;
    /** The session snapshot, with the `session` permission; `null` without it or before `connect`. */
    session(): CloudSession | null;
    /** Hears each session change, with the `session` permission. */
    onSessionChange(listener: (session: CloudSession | null) => void): () => void;
    /**
     * Hears, once, that the cloud this view opened on is no longer the selected one. Nothing answers
     * after it: the page has nothing more to read here.
     */
    onCloudChanged(listener: () => void): () => void;
}

interface Hello {
    contract: number;
    seq: number;
    session: CloudSession | null;
    allowed: DataAllowed;
}

interface Stream {
    listener: (...event: unknown[]) => void;
    onEnd?: (error: ChaticAppsError) => void;
}

const DATA_TARGET = 'data';

const isListener = (value: unknown) =>
    typeof value === 'object' && value !== null && (value as { $listener?: unknown }).$listener === true;

const endedOf = (event: unknown): { code?: unknown; message?: unknown } | null => {
    if (event === null || typeof event !== 'object' || Array.isArray(event)) return null;
    const ended = (event as { $ended?: unknown }).$ended;
    return ended && typeof ended === 'object' ? (ended as { code?: unknown; message?: unknown }) : null;
};

/**
 * `apps.data` over the bridge. `supported` reads the handshake each time, so a page restored from the
 * back-forward cache answers from the handshake it made again.
 */
export const runtimeOver = (
    client: BridgeClient,
    supported: () => boolean,
    report: (error: unknown) => void
): ChaticAppsData & { reset(): void; dispose(): void } => {
    let hello: Promise<Hello> | null = null;
    // Ends the hello in flight. With no timeout, a hello whose reply goes to a host that is gone — a
    // page restored from the back-forward cache meets a new one — would otherwise never settle.
    let abandonHello: ((error: ChaticAppsError) => void) | null = null;
    let answered: Hello | null = null;
    let session: CloudSession | null = null;
    let cloudChanged = false;
    let sequence = 0;
    const streams = new Map<string, Stream>();
    const sessionListeners = new Set<(session: CloudSession | null) => void>();
    const cloudListeners = new Set<() => void>();

    const safely = (run: () => void) => {
        try {
            run();
        } catch (error) {
            report(error);
        }
    };

    const markCloudChanged = () => {
        if (cloudChanged) return;
        cloudChanged = true;
        cloudListeners.forEach(listener => safely(listener));
    };

    // Every failure goes through here, so a call that meets the cloud change tells the listeners too.
    const failed = (error: unknown): never => {
        if (error instanceof ChaticAppsError && error.code === 'CLOUD_CHANGED') markCloudChanged();
        throw error;
    };

    const endAll = (error: ChaticAppsError) => {
        const ended = [...streams.values()];
        streams.clear();
        ended.forEach(stream => safely(() => stream.onEnd?.(error)));
    };

    const offEvent = client.onPush('OnRuntimeEvent', data => {
        const { subscriptionId, event } = (data ?? {}) as { subscriptionId?: unknown; event?: unknown };
        const stream = typeof subscriptionId === 'string' ? streams.get(subscriptionId) : undefined;
        if (!stream || typeof subscriptionId !== 'string') return;
        const ended = endedOf(event);
        if (ended) {
            streams.delete(subscriptionId);
            const code = typeof ended.code === 'string' ? ended.code : 'INTERNAL_ERROR';
            const message = typeof ended.message === 'string' ? ended.message : code;
            if (code === 'CLOUD_CHANGED') markCloudChanged();
            safely(() => stream.onEnd?.(new ChaticAppsError(code, message)));
            return;
        }
        safely(() => stream.listener(...(Array.isArray(event) ? event : [event])));
    });

    const offSession = client.onPush('OnRuntimeSessionChanged', data => {
        const { seq, session: next } = (data ?? {}) as { seq?: unknown; session?: unknown };
        if (!answered || typeof seq !== 'number' || seq <= answered.seq) return;
        answered = { ...answered, seq };
        session = (next as CloudSession | null | undefined) ?? null;
        sessionListeners.forEach(listener => safely(() => listener(session)));
    });

    const connect = (): Promise<Hello> => {
        if (!supported()) {
            return Promise.reject(
                new ChaticAppsError('NOT_SUPPORTED', "This app does not answer this page's cloud data requests.")
            );
        }
        if (!hello) {
            const abandoned = new Promise<never>((_, reject) => {
                abandonHello = reject;
            });
            // No timeout: the app answers once the user has been asked whether this page may read the
            // cloud, and a person reading that question takes as long as they take — as with `share`.
            const attempt: Promise<Hello> = Promise.race([
                client.request<Hello>('RuntimeHello', { contracts: [...SDK_DATA_CONTRACTS] }, { timeoutMs: null }),
                abandoned,
            ])
                .then(reply => {
                    if (hello === attempt) {
                        answered = reply;
                        session = reply.session ?? null;
                    }
                    return reply;
                })
                .catch(error => {
                    // Not kept: the user may allow the page next time it asks.
                    if (hello === attempt) hello = null;
                    return failed(error);
                });
            hello = attempt;
        }
        return hello;
    };

    const allowedFor = async (kind: 'calls' | 'streams', method: string) => {
        const reply = await connect();
        if (!reply.allowed[kind].includes(method)) {
            throw new ChaticAppsError(
                'RUNTIME_NOT_ALLOWED',
                `${method} is not one this page may ${kind === 'calls' ? 'call' : 'subscribe to'}.`
            );
        }
    };

    // One untyped body behind both of the interface's `call` signatures.
    const call = async (method: string, ...args: unknown[]): Promise<never> => {
        await allowedFor('calls', method);
        const reply = await client
            .request<{ value: never }>('RuntimeCall', { target: DATA_TARGET, method, args })
            .catch(failed);
        return reply.value;
    };

    const subscribe = async (
        method: string,
        args: unknown[],
        listener: (...event: never[]) => void,
        onEnd?: (error: ChaticAppsError) => void
    ) => {
        await allowedFor('streams', method);
        const subscriptionId = `cas-s${(++sequence).toString(36)}`;
        streams.set(subscriptionId, { listener: listener as (...event: unknown[]) => void, onEnd });
        try {
            await client.request('RuntimeSubscribe', {
                subscriptionId,
                target: DATA_TARGET,
                topic: method,
                args: args.some(isListener) ? args : [...args, LISTENER],
            });
        } catch (error) {
            streams.delete(subscriptionId);
            failed(error);
        }
        return {
            stop: async () => {
                if (!streams.delete(subscriptionId)) return;
                await client.request('RuntimeUnsubscribe', { subscriptionId }).catch(() => undefined);
            },
        };
    };

    // A place profile is the row `<place id>@<user id>`, and the app answers only the place the view
    // opened on: the place and, for the user's own, the user's id are read off the session, so neither
    // needs a method of its own on the app's side.
    const placeOf = async (): Promise<string> => {
        await connect();
        const place = session?.committedSiteId;
        if (!place) {
            throw new ChaticAppsError(
                'NOT_SUPPORTED',
                'A place profile needs the session permission, while the session is on a place.'
            );
        }
        return place;
    };
    const myId = async (): Promise<string> => {
        await connect();
        const user = session?.context.identity.userId;
        if (!user) throw new ChaticAppsError('NOT_SUPPORTED', "The user's own profile needs the session permission.");
        return user;
    };
    const profileId = async (userId: string) => `${await placeOf()}@${userId}`;
    const placeProfile = async (userId: string) =>
        call('profile.cacheRead', await profileId(userId)) as Promise<CloudProfile | null>;
    const observePlaceProfile = async (
        userId: string,
        listener: (profile: CloudProfile | null) => void,
        options?: DataStreamOptions
    ) =>
        subscribe(
            'profile.observeItem',
            [await profileId(userId)],
            listener as (...event: never[]) => void,
            options?.onEnd
        );

    return {
        connect: () => connect().then(({ contract, allowed }) => ({ contract, allowed })),
        can: method =>
            !!answered && (answered.allowed.calls.includes(method) || answered.allowed.streams.includes(method)),
        call,
        subscribe,
        sendMessage: (channelId, text) => call('chat.sendChat', { channelId, content: text }),
        react: (messageId, emoji, on) =>
            call('chat.setReaction', { chatId: messageId, emoji, action: on ? 'on' : 'off' }),
        placeProfile,
        placeProfiles: async () => call('profile.cacheReadList', { sid: await placeOf() }),
        observePlaceProfile,
        myProfile: async () => placeProfile(await myId()),
        observeMyProfile: async (listener, options) => observePlaceProfile(await myId(), listener, options),
        session: () => session,
        onSessionChange: listener => {
            sessionListeners.add(listener);
            return () => sessionListeners.delete(listener);
        },
        onCloudChanged: listener => {
            cloudListeners.add(listener);
            return () => cloudListeners.delete(listener);
        },
        // A page restored from the back-forward cache meets a new host: its streams are gone there.
        reset: () => {
            abandonHello?.(
                new ChaticAppsError('DISCONNECTED', 'The page was restored before the app answered. Connect again.')
            );
            abandonHello = null;
            hello = null;
            answered = null;
            session = null;
            endAll(new ChaticAppsError('DISCONNECTED', 'The page was restored; its streams ended. Subscribe again.'));
        },
        dispose: () => {
            offEvent();
            offSession();
            streams.clear();
        },
    };
};

/** The same interface in a browser tab: nothing to read, nothing to send. */
export const browserRuntime = (): ChaticAppsData => {
    const notInApp = () => Promise.reject(new ChaticAppsError('NOT_IN_APP', "The app's data is read only in the app."));
    return {
        connect: notInApp,
        can: () => false,
        call: notInApp,
        subscribe: notInApp,
        sendMessage: notInApp,
        react: notInApp,
        placeProfile: notInApp,
        placeProfiles: notInApp,
        observePlaceProfile: notInApp,
        myProfile: notInApp,
        observeMyProfile: notInApp,
        session: () => null,
        onSessionChange: () => () => undefined,
        onCloudChanged: () => () => undefined,
    };
};
