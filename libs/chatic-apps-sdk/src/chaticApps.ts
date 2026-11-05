import { createBridgeClient, type BridgeClient } from './client';
import { ChaticAppsError } from './errors';
import { browserStorage, storageOver, type ChaticAppsStorage } from './storage';
import { isInApp, nativeTransport, type Transport } from './transport';
import type { ChaticAppsContext, CloseTrigger, DeviceKind, HapticKind, PermissionState } from './types';

/** What the page can do. `supports` answers from the app's handshake; a browser tab has none. */
export type Capability =
    | 'finish'
    | 'title'
    | 'haptic'
    | 'clipboard'
    | 'share'
    | 'openUrl'
    | 'userKey'
    | 'back'
    | 'closeGuard'
    | 'errorReport'
    | 'storage'
    | 'permissions';

/** The request behind each capability. */
const REQUESTS: Record<Capability, string> = {
    finish: 'FinishSubWebView',
    title: 'SetSubWebViewTitle',
    haptic: 'TriggerHaptic',
    clipboard: 'CopyToClipboard',
    share: 'OpenShareSheet',
    openUrl: 'OpenURL',
    userKey: 'GetSubWebViewUserKey',
    back: 'SetCanGoBack',
    closeGuard: 'SetSubWebViewCloseGuard',
    errorReport: 'ReportSubWebViewError',
    storage: 'GetSubWebViewStorage',
    permissions: 'RequestSubWebViewPermission',
};

/** The protocol major this library speaks. */
const PROTOCOL_VERSION = 1;

/** What the app keeps of an error report; cut here too, so a report never runs into the message limit. */
const REPORT_MESSAGE_LIMIT = 1000;
const REPORT_STACK_LIMIT = 4000;

export interface ShareContent {
    title?: string;
    message?: string;
    /** `http(s)` only. Share `apps.link(params)` so a tap opens the page in the app. */
    url?: string;
}

/** What a link hands the page it opens, as its query: `{ level: 3 }` opens the page at `/?level=3`. */
export type LinkParams = Readonly<Record<string, string | number | boolean>>;

/**
 * How a share went. `copied` is this library's fallback in a browser with no share sheet: the link
 * or message went to the clipboard instead. On Android the app answers `shared` as soon as the chooser
 * opens, whatever the user then does; only iOS reports `dismissed`.
 */
export type ShareOutcome = 'shared' | 'dismissed' | 'copied';

/**
 * The camera and the microphone. A page captures with the browser's own `getUserMedia`; the OS asks the
 * user the first time, under the app's name. These calls let a page learn where it stands and ask when
 * the user reaches for the feature, rather than meet the prompt in the middle of a capture.
 */
export interface ChaticAppsPermissions {
    /** Where the app stands with the OS for `kind`, showing the user nothing. */
    query(kind: DeviceKind): Promise<PermissionState>;
    /**
     * Asks the OS for `kind` and resolves once the user has answered: `granted`, `blocked` (it will not
     * ask again; `openSettings()`), or `prompt` when the user refused this time and it may be asked
     * again. Ask when the user reaches for the feature, not at start: an unexplained question is the
     * one most often refused.
     */
    request(kind: DeviceKind): Promise<PermissionState>;
}

export interface ConnectOptions {
    /** Default wait for a reply, in milliseconds, while the page is visible. 10 seconds. */
    timeoutMs?: number;
    /** Report uncaught errors and unhandled rejections to the app's log. On by default. */
    reportErrors?: boolean;
}

export interface ChaticApps {
    /** `true` inside the app; `false` in a browser tab, where the bridge calls fall back or fail. */
    readonly inApp: boolean;
    /** The app's context: view, platform, language, theme, `params`, `appLink`. `null` in a browser. */
    readonly context: ChaticAppsContext | null;
    /** Whether the app answers `capability` for this page: its version and the page's manifest. */
    supports(capability: Capability): boolean;
    /** Closes the view and hands `result` (JSON, at most 16 KiB) to whoever opened it. */
    finish(result?: unknown): Promise<void>;
    /** Puts a title (1–100 characters) in the app's bar; in a browser, the document's title. */
    setTitle(title: string): Promise<void>;
    /** Plays one short haptic. Never fails: a missing haptic costs nothing but the buzz. */
    haptic(kind: HapticKind): void;
    /** Copies text; in a browser, through the browser's clipboard. */
    copy(text: string): Promise<void>;
    /** Opens a web, mail, phone, SMS or store link outside the view. */
    openUrl(url: string): Promise<void>;
    /** Opens the share sheet; in a browser, the Web Share sheet, else copies. Waits for the user. */
    share(content: ShareContent): Promise<ShareOutcome>;
    /** This device's key for this page's origin (64 hex characters). Not an account, not a proof. */
    getUserKey(): Promise<string>;
    /**
     * Writes an error to the app's log under this page's origin. `false` when it was not recorded. An
     * `Error` sends its message and stack, a string itself, anything else only its type: a rejected
     * value can be the user's own data, which must not reach a log.
     */
    reportError(error: unknown): Promise<boolean>;
    /**
     * This page's own storage, on the device, apart from every other page's. In a browser tab, the
     * browser's `localStorage` under the same limits.
     */
    readonly storage: ChaticAppsStorage;
    /**
     * Takes Android's back button while `handler` is set: each press calls it, and nothing else
     * happens. `null` gives back to the app.
     */
    onBack(handler: (() => void) | null): void;
    /**
     * Asks the page before the user closes the view while `handler` is set: it gets what the user did
     * and answers whether to close. A second close within three seconds closes anyway. `null` lets
     * every close through. Use it only for something the user would lose.
     */
    onCloseRequest(handler: ((trigger: CloseTrigger) => boolean | Promise<boolean>) | null): void;
    /** The camera and the microphone. */
    readonly permissions: ChaticAppsPermissions;
    /** Opens the app's page in the OS settings, where a `blocked` permission can be turned back on. */
    openSettings(): Promise<void>;
    /** Hears a theme or language change while the page shows; returns the function that stops it. */
    onContextChange(listener: (context: ChaticAppsContext) => void): () => void;
    /**
     * A link that opens this page in the app with `params` as its query:
     * `https://app.chatic.io/apps/<appId>?level=3`. The page is always opened at its root, so read what
     * a link carries from `location.search`. In a browser, or an app before `appLink`, this page's own
     * root with the same query instead.
     */
    link(params?: LinkParams): string;
    /** Stops listening to the app. Pending calls fail with `DISCONNECTED`; the next `connect()` starts afresh. */
    disconnect(): void;
}

type HandshakeReply = {
    supportedWebMessages?: unknown;
    subWebView?: ChaticAppsContext;
};

const readGlobalContext = (): ChaticAppsContext | null =>
    (typeof window !== 'undefined' &&
        (window as unknown as { ChaticSubWebView?: ChaticAppsContext }).ChaticSubWebView) ||
    null;

/** An app before the handshake carried the context defines it as a global, at the latest by `load`. */
const loadedContext = (): Promise<ChaticAppsContext | null> =>
    new Promise(resolve => {
        if (typeof document === 'undefined' || document.readyState === 'complete') {
            resolve(readGlobalContext());
            return;
        }
        window.addEventListener('load', () => resolve(readGlobalContext()), { once: true });
    });

/** What a report carries: never a value's contents unless it is an `Error` or a string. */
const reportOf = (error: unknown): { message: string; stack?: string } => {
    let message: string;
    let stack: string | undefined;
    try {
        if (error instanceof Error) {
            message = error.message || error.name;
            stack = typeof error.stack === 'string' ? error.stack : undefined;
        } else if (typeof error === 'string') {
            message = error;
        } else {
            message = `A non-Error value was thrown: ${Object.prototype.toString.call(error)}`;
        }
    } catch {
        message = 'An error that could not be read was thrown';
    }
    return {
        message: (message || 'Unknown error').slice(0, REPORT_MESSAGE_LIMIT),
        ...(stack ? { stack: stack.slice(0, REPORT_STACK_LIMIT) } : {}),
    };
};

const notSupported = (what: string) =>
    new ChaticAppsError('NOT_SUPPORTED', `${what} is not available here: an older app, or not granted.`);

const notInApp = (what: string) =>
    Promise.reject(new ChaticAppsError('NOT_IN_APP', `${what} needs the app; this page is in a browser.`));

/**
 * `params` as a link's query: `''` for none, else `?` and the pairs in the order given. A link carries
 * a query and nothing else, because the app opens every page at its root.
 */
const queryOf = (params: LinkParams = {}): string => {
    // A page without types can still pass the path the earlier `link(path)` took; that is no query.
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
        throw new ChaticAppsError('INVALID', 'link() takes an object of query params, such as { level: 3 }.');
    }
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) search.append(key, String(value));
    const query = search.toString();
    return query ? `?${query}` : '';
};

/** This page's own root plus `query`, for a link outside the app. */
const ownLink = (query: string) => (typeof location === 'undefined' ? `/${query}` : `${location.origin}/${query}`);

let shared: Promise<ChaticApps> | null = null;

/**
 * Connects to the app, or — in a browser tab — to nothing, returning the same interface with browser
 * fallbacks, so one page runs in both. In the app it shakes hands first: what the app answers, and the
 * context, come from that reply.
 *
 * One connection per page: a second call returns the first one's result, so two parts of a page — or a
 * component mounted twice — cannot undo each other's back handler or report every error twice.
 *
 * Rejects with `UNSUPPORTED_PROTOCOL` when the app speaks a protocol major this library does not know
 * (update the library, and tell the user the page needs updating), and with `TIMEOUT` when the app
 * does not answer — as for a page the view navigated to from the one it opened.
 */
export const connect = (options: ConnectOptions = {}): Promise<ChaticApps> => {
    if (!shared) {
        shared = (isInApp() ? connectOver(nativeTransport(), options) : Promise.resolve(browserApps())).catch(error => {
            shared = null;
            throw error;
        });
    }
    return shared;
};

/**
 * `connect` over a given channel, without sharing the connection. For this library's tests and the
 * app's contract suite; not part of the published interface.
 */
export const connectOver = async (transport: Transport, options: ConnectOptions = {}): Promise<ChaticApps> => {
    const client = createBridgeClient(transport, options.timeoutMs);
    try {
        const state = await handshake(client, true);
        return appApps(client, state, options);
    } catch (error) {
        client.close();
        throw error;
    }
};

interface AppState {
    supported: Set<unknown>;
    context: ChaticAppsContext | null;
}

const handshake = async (client: BridgeClient, readGlobal: boolean): Promise<AppState> => {
    const reply = await client.request<HandshakeReply>('WebAppReady', {});
    const context = reply.subWebView ?? (readGlobal ? await loadedContext() : null);
    if (context && context.protocolVersion !== PROTOCOL_VERSION) {
        throw new ChaticAppsError(
            'UNSUPPORTED_PROTOCOL',
            `The app speaks protocol ${String(context.protocolVersion)}; this library speaks ${PROTOCOL_VERSION}.`
        );
    }
    return {
        supported: new Set(Array.isArray(reply.supportedWebMessages) ? reply.supportedWebMessages : []),
        context,
    };
};

const appApps = (client: BridgeClient, state: AppState, options: ConnectOptions): ChaticApps => {
    let backHandler: (() => void) | null = null;
    let closeHandler: ((trigger: CloseTrigger) => boolean | Promise<boolean>) | null = null;
    const contextListeners = new Set<(context: ChaticAppsContext) => void>();
    const cleanups: Array<() => void> = [];

    const supports = (capability: Capability) => state.supported.has(REQUESTS[capability]);
    // `type` names another request of the same capability: the device requests come together, but each
    // is checked against what the app listed, so one the app lacks is `NOT_SUPPORTED`, not `NOT_FOUND`.
    const call = <T>(capability: Capability, data?: object, timeoutMs?: number | null, type?: string): Promise<T> => {
        const request = type ?? REQUESTS[capability];
        return state.supported.has(request)
            ? client.request<T>(request, data, timeoutMs === undefined ? {} : { timeoutMs })
            : Promise.reject(notSupported(capability));
    };

    // The storage requests come together: an app that answers one answers all five.
    const stored = <T>(type: string, data: object) =>
        supports('storage') ? client.request<T>(type, data) : Promise.reject(notSupported('storage'));

    const announce = (context: ChaticAppsContext) =>
        contextListeners.forEach(listener => {
            try {
                listener(context);
            } catch (error) {
                void apps.reportError(error);
            }
        });

    // Claims last one page load in the app, so they are set whenever a handler changes and again
    // whenever the page shows.
    const assertClaims = () => {
        if (supports('back')) void client.request(REQUESTS.back, { canGoBack: !!backHandler }).catch(() => undefined);
        if (supports('closeGuard')) {
            void client.request(REQUESTS.closeGuard, { enabled: !!closeHandler }).catch(() => undefined);
        }
    };

    // A page restored from the back-forward cache meets a fresh host: it shakes hands again, takes the
    // context as it is now — the theme may have changed while it was away — and sets its claims again.
    const onPageShow = (event: Event) => {
        if (!(event as PageTransitionEvent).persisted) {
            assertClaims();
            return;
        }
        void handshake(client, false)
            .then(next => {
                const before = state.context;
                state.supported = next.supported;
                if (next.context) state.context = next.context;
                assertClaims();
                const after = state.context;
                if (after && (after.theme !== before?.theme || after.locale !== before?.locale)) announce(after);
            })
            .catch(() => undefined);
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('pageshow', onPageShow);
        cleanups.push(() => window.removeEventListener('pageshow', onPageShow));
    }

    cleanups.push(
        client.onPush('OnBackPressed', () => {
            try {
                backHandler?.();
            } catch (error) {
                void apps.reportError(error);
            }
        })
    );
    cleanups.push(
        client.onPush('OnSubWebViewCloseRequested', data => {
            const handler = closeHandler;
            if (!handler) return;
            const trigger = (data as { trigger?: CloseTrigger })?.trigger ?? 'control';
            void Promise.resolve()
                .then(() => handler(trigger))
                .then(close => (close ? apps.finish() : undefined))
                .catch(error => apps.reportError(error));
        })
    );
    cleanups.push(
        client.onPush('OnSubWebViewContextChanged', data => {
            if (!state.context) return;
            state.context = { ...state.context, ...(data as Partial<ChaticAppsContext>) };
            announce(state.context);
        })
    );

    const apps: ChaticApps = {
        inApp: true,
        get context() {
            return state.context;
        },
        supports,
        finish: result => call<void>('finish', result === undefined ? {} : { result }).then(() => undefined),
        setTitle: title => call<void>('title', { title }).then(() => undefined),
        haptic: kind => {
            if (supports('haptic')) void client.request(REQUESTS.haptic, { kind }).catch(() => undefined);
        },
        copy: text => call<void>('clipboard', { text }).then(() => undefined),
        openUrl: url => call<void>('openUrl', { url }).then(() => undefined),
        share: content =>
            call<{ action?: string }>('share', content, null).then(reply =>
                reply?.action === 'dismissedAction' ? 'dismissed' : 'shared'
            ),
        getUserKey: () => call<{ key: string }>('userKey').then(reply => reply.key),
        permissions: {
            query: kind =>
                call<{ state: PermissionState }>('permissions', { kind }, undefined, 'GetSubWebViewPermission').then(
                    reply => reply.state
                ),
            // Waits for the user, however long they take.
            request: kind => call<{ state: PermissionState }>('permissions', { kind }, null).then(reply => reply.state),
        },
        openSettings: () => call<void>('permissions', {}, undefined, 'OpenSettings').then(() => undefined),
        reportError: error =>
            supports('errorReport')
                ? client
                      .request<{ recorded?: boolean }>(REQUESTS.errorReport, reportOf(error))
                      .then(reply => !!reply?.recorded)
                      .catch(() => false)
                : Promise.resolve(false),
        storage: storageOver({
            get: keys => stored('GetSubWebViewStorage', { keys }),
            set: entries => stored('SetSubWebViewStorage', { entries }),
            remove: keys => stored('RemoveSubWebViewStorage', { keys }),
            clear: () => stored('ClearSubWebViewStorage', {}),
            info: () => stored('GetSubWebViewStorageInfo', {}),
        }),
        onBack: handler => {
            backHandler = handler;
            assertClaims();
        },
        onCloseRequest: handler => {
            closeHandler = handler;
            assertClaims();
        },
        onContextChange: listener => {
            contextListeners.add(listener);
            return () => contextListeners.delete(listener);
        },
        link: params => {
            const query = queryOf(params);
            const appLink = state.context?.appLink;
            return appLink ? `${appLink}${query}` : ownLink(query);
        },
        disconnect: () => {
            cleanups.forEach(cleanup => cleanup());
            client.close();
            shared = null;
        },
    };

    if (options.reportErrors !== false && typeof window !== 'undefined') {
        const onError = (event: ErrorEvent) => void apps.reportError(event.error ?? event.message);
        const onRejection = (event: PromiseRejectionEvent) => void apps.reportError(event.reason);
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);
        cleanups.push(() => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
        });
    }

    return apps;
};

/**
 * The browser's own permissions, so a page runs the same flow in a tab while it is built: the Permissions
 * API to read, a capture to ask. A browser's `denied` is the app's `blocked` — it will not ask again.
 * Safari and Firefox give the Permissions API no entry for these, so there a refusal always reads
 * `prompt`; only Chrome-family browsers report `blocked`.
 */
const browserPermissions = (): ChaticAppsPermissions => {
    const query = async (kind: DeviceKind): Promise<PermissionState> => {
        try {
            const status = await navigator.permissions.query({ name: kind as PermissionName });
            if (status.state === 'granted') return 'granted';
            return status.state === 'denied' ? 'blocked' : 'prompt';
        } catch {
            // No Permissions API, or none for this kind (Firefox has no `camera`): only asking tells.
            return 'prompt';
        }
    };
    return {
        query,
        request: async kind => {
            if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
                throw new ChaticAppsError('NOT_SUPPORTED', `This browser cannot capture the ${kind}.`);
            }
            try {
                const stream = await navigator.mediaDevices.getUserMedia(
                    kind === 'camera' ? { video: true } : { audio: true }
                );
                stream.getTracks().forEach(track => track.stop());
                return 'granted';
            } catch (error) {
                const name = (error as { name?: string })?.name;
                if (name === 'NotFoundError' || name === 'OverconstrainedError') {
                    throw new ChaticAppsError('UNAVAILABLE', `This device has no ${kind}.`);
                }
                // Not an answer from the user: a busy device, an insecure page. Reading it as `prompt`
                // would have the page ask again, forever.
                if (
                    name === 'NotReadableError' ||
                    name === 'SecurityError' ||
                    name === 'TypeError' ||
                    name === 'AbortError'
                ) {
                    throw new ChaticAppsError('INTERNAL_ERROR', `The ${kind} could not be used: ${name}.`);
                }
                return (await query(kind)) === 'blocked' ? 'blocked' : 'prompt';
            }
        },
    };
};

/** The same interface for a browser tab: what the browser can stand in for, and `NOT_IN_APP` for the rest. */
const browserApps = (): ChaticApps => {
    const clipboardWrite = (text: string) =>
        typeof navigator !== 'undefined' && navigator.clipboard
            ? navigator.clipboard.writeText(text)
            : Promise.reject(notSupported('The clipboard'));
    return {
        inApp: false,
        context: null,
        supports: () => false,
        finish: () => notInApp('Finishing the view'),
        setTitle: async title => {
            if (typeof document !== 'undefined') document.title = title;
        },
        haptic: () => {
            if (typeof navigator !== 'undefined') navigator.vibrate?.(10);
        },
        copy: clipboardWrite,
        openUrl: async url => {
            if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
        },
        share: async content => {
            const text = [content.message, content.url].filter(Boolean).join(' ');
            if (!text) throw new ChaticAppsError('INVALID', 'Share a message or a url.');
            if (typeof navigator !== 'undefined' && navigator.share) {
                try {
                    await navigator.share(content);
                    return 'shared';
                } catch (error) {
                    // Only the user's own cancel is an answer; anything else (no user gesture, a
                    // refused payload) falls back to the clipboard.
                    if ((error as { name?: string })?.name === 'AbortError') return 'dismissed';
                }
            }
            await clipboardWrite(text);
            return 'copied';
        },
        getUserKey: () => notInApp('A user key'),
        permissions: browserPermissions(),
        openSettings: () => notInApp('Opening the settings'),
        reportError: async error => {
            console.error(error);
            return false;
        },
        storage: browserStorage(),
        onBack: () => undefined,
        onCloseRequest: () => undefined,
        onContextChange: () => () => undefined,
        link: params => ownLink(queryOf(params)),
        disconnect: () => {
            shared = null;
        },
    };
};
