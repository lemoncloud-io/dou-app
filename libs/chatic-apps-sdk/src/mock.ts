import { SDK_BRIDGE_VERSION } from './client';
import { isOneReactionCharacter } from './reaction';
import { ruledStore, type StoreFile } from './storage';
import type {
    DataCallArgs,
    DataCallName,
    DataCallResult,
    CloudChat,
    CloudSession,
    DataStreamArgs,
    DataStreamEvent,
    DataStreamName,
} from './runtimeTypes';
import type { ChaticAppsContext, CloseTrigger, DeviceKind, HapticKind, PermissionState, SafeArea } from './types';

/** A manifest permission, as the page would declare it in `/.well-known/chatic-app.json`. */
export type MockPermission =
    | 'clipboard'
    | 'share'
    | 'openUrl'
    | 'userKey'
    | 'session'
    | 'cloud'
    | 'place'
    | 'channel'
    | 'chat'
    | 'user'
    | 'chatSend'
    | 'chatReact';

/**
 * What a known method answers in the mock: the same shape the app answers with, so an answer of the
 * wrong shape fails the type check here rather than the page in the app.
 */
export type MockDataCalls = {
    [M in DataCallName]?: (...args: DataCallArgs<M>) => DataCallResult<M> | Promise<DataCallResult<M>>;
} & {
    /** A method this library does not know: answered with whatever it returns. */
    [method: string]: ((...args: never[]) => unknown) | undefined;
};

/** A known stream in the mock: `emit` sends one event of the app's shape. */
export type MockDataStreams = {
    [M in DataStreamName]?: (
        emit: (...event: DataStreamEvent<M>) => void,
        ...args: DataStreamArgs<M>
    ) => (() => void) | void;
} & {
    [method: string]: ((emit: (...event: unknown[]) => void, ...args: never[]) => (() => void) | void) | undefined;
};

/**
 * The app's data, as the mock answers `apps.data`: each method the page may call, and each stream it
 * may subscribe to, by its `<repository>.<method>` name. The mock does not know the app's whitelist —
 * it answers what is given here and refuses the rest — so read the real `allowed` in the app. The one
 * exceptions are the two writes: with `chatSend` the mock opens `chat.sendChat` itself and records each
 * message (`MockController.sentMessages`), and with `chatReact` it opens `chat.setReaction` and records
 * each reaction (`MockController.reactions`).
 */
export interface MockData {
    /** The session snapshot, given to a page with the `session` permission. */
    session?: CloudSession | null;
    calls?: MockDataCalls;
    /** Each gets `emit`, which sends one event, and the page's arguments; it returns how to stop. */
    streams?: MockDataStreams;
    /** How the user answers the app's question about this cloud; `allow` by default. */
    consent?: 'allow' | 'refuse';
}

/** A message the page sent through `apps.data.sendMessage` (or `chat.sendChat`) in the mock. */
export interface MockSentMessage {
    channelId: string;
    text: string;
}

/** A reaction the page set or took off through `apps.data.react` (or `chat.setReaction`) in the mock. */
export interface MockReaction {
    messageId: string;
    emoji: string;
    on: boolean;
}

/** How the user answers when the page asks for a device: allows it, refuses it, or the OS blocks it. */
export type MockDeviceAnswer = 'allow' | 'deny' | 'blocked' | 'unavailable';

export interface MockOptions {
    /** What the page's manifest would grant. None by default, as for a page with no manifest. */
    permissions?: MockPermission[];
    /**
     * Overrides for the context the page gets; the rest is filled in. `display` is `clean` by default;
     * with `immersive` the page gets a phone's insets in `safeArea` and in the
     * `--chatic-safe-area-inset-*` properties, as the app sets them, and `rotate()` turns the phone.
     */
    context?: Partial<ChaticAppsContext>;
    /** The key `getUserKey` answers; a stable one derived from the page's origin by default. */
    userKey?: string;
    /** Called when the view closes: by the page (`finish`, with its result) or by the user. */
    onClose?: (closed: { by: 'page' | 'user'; result?: unknown }) => void;
    /**
     * How the user answers each device the page asks for; `allow` by default, `unavailable` for a device
     * the phone does not have. A `deny` leaves the device `prompt`, as on Android; iOS reports a refusal as
     * `blocked`. Only the answer is played: the page's `getUserMedia` still meets the browser's own prompt.
     */
    deviceAnswers?: Partial<Record<DeviceKind, MockDeviceAnswer>>;
    /** What the page's storage holds when the mock starts; empty by default. Kept in memory only. */
    storage?: { [key: string]: unknown };
    /** Log each request and reply to the console. On by default. */
    log?: boolean;
    /** The cloud's data, for a page with a cloud data permission (`apps.data`). */
    data?: MockData;
}

export interface MockController {
    /** The title the page last asked for, if any. */
    readonly title: string | undefined;
    /** How the view closed, if it has: by the page (with its result) or by the user. */
    readonly closed: { by: 'page' | 'user'; result?: unknown } | null;
    /** What the page's storage holds now. */
    readonly storage: { [key: string]: unknown };
    /** Where the app stands with the OS for each device. */
    readonly devices: Record<DeviceKind, PermissionState>;
    /** Android's back button: to the page if it took back, else back in history, else a close. */
    pressBack(): void;
    /** The user asks to close: to the page if it guards closing (a second ask within 3 s closes). */
    requestClose(trigger?: CloseTrigger): void;
    /** A theme or language change while the page shows. */
    changeContext(change: Partial<Pick<ChaticAppsContext, 'theme' | 'locale'>>): void;
    /**
     * The user turns the phone. An `immersive` page gets the other orientation's insets, in `safeArea`
     * through `onContextChange` and in the CSS properties; a padded page's safe area stays 0, so nothing
     * reaches it.
     */
    rotate(): void;
    /** The user moves to another cloud under the view: every stream ends, and nothing answers after. */
    changeCloud(): void;
    /** The messages the page sent and the mock answered, in the order they went through. */
    readonly sentMessages: readonly MockSentMessage[];
    /** The reactions the page set and took off, in the order they went through. */
    readonly reactions: readonly MockReaction[];
    /** Removes the fake app. */
    uninstall(): void;
}

const BASE = [
    'WebAppReady',
    'Ping',
    'FinishSubWebView',
    'SetSubWebViewTitle',
    'TriggerHaptic',
    'SetCanGoBack',
    'SetSubWebViewCloseGuard',
    'ReportSubWebViewError',
    'GetSubWebViewStorage',
    'SetSubWebViewStorage',
    'RemoveSubWebViewStorage',
    'ClearSubWebViewStorage',
    'GetSubWebViewStorageInfo',
    'GetSubWebViewPermission',
    'RequestSubWebViewPermission',
    'OpenSettings',
];
const GATED: Partial<Record<MockPermission, string>> = {
    clipboard: 'CopyToClipboard',
    share: 'OpenShareSheet',
    openUrl: 'OpenURL',
    userKey: 'GetSubWebViewUserKey',
};
const RUNTIME_PERMISSIONS: readonly MockPermission[] = [
    'session',
    'cloud',
    'place',
    'channel',
    'chat',
    'user',
    'chatSend',
    'chatReact',
];
const RUNTIME_REQUESTS = ['RuntimeHello', 'RuntimeCall', 'RuntimeSubscribe', 'RuntimeUnsubscribe'];
const DEVICE_KINDS: readonly DeviceKind[] = ['camera', 'microphone'];
const KINDS: readonly HapticKind[] = ['selection', 'impact', 'success', 'warning', 'error'];
const MESSAGE_LIMIT = 64 * 1024;
const RESULT_LIMIT = 16 * 1024;
const FORCE_WINDOW_MS = 3000;
/** The app's limit on a message a page sends, in UTF-16 code units. */
const SEND_LIMIT = 1000;
const SEND_METHOD = 'chat.sendChat';
const REACT_METHOD = 'chat.setReaction';
/** The app's limit on the message id a reaction names. */
const MESSAGE_ID_LIMIT = 200;
/** A phone's insets, in CSS pixels, for an `immersive` page: upright, then turned. */
const PORTRAIT_INSETS: SafeArea = { top: 47, right: 0, bottom: 34, left: 0 };
const LANDSCAPE_INSETS: SafeArea = { top: 0, right: 47, bottom: 21, left: 47 };
const NO_INSETS: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };

/** The app's limit on the room id a send names. */
const ROOM_ID_LIMIT = 200;

/** What the app hands to the OS: web, mail, phone, SMS and store links — never a page or the app's own. */
const openable = (url: string): boolean => {
    if (/^(mailto|tel|sms|itms-apps|market):/i.test(url)) return true;
    const host = /^https?:\/\/([^/?#:@]+)/i.exec(url)?.[1]?.toLowerCase();
    if (!host) return false;
    return !/\.(apps|apps-dev)\.chatic\.io$/.test(host) && !/^app(-dev)?\.chatic\.io$/.test(host);
};

const fitsJson = (value: unknown, limit: number): boolean => {
    if (value === undefined) return true;
    try {
        const json = JSON.stringify(value);
        return json !== undefined && json.length <= limit;
    } catch {
        return false;
    }
};

const textWithin = (value: unknown, limit: number): boolean =>
    value == null || (typeof value === 'string' && value.length <= limit);

/** 64 hex characters that stay the same for one origin: a stand-in, not the app's derivation. */
const mockKey = (origin: string): string => {
    let out = '';
    for (let round = 0; out.length < 64; round++) {
        let hash = 0x811c9dc5 ^ round;
        for (let i = 0; i < origin.length; i++) hash = Math.imul(hash ^ origin.charCodeAt(i), 0x01000193);
        out += (hash >>> 0).toString(16).padStart(8, '0');
    }
    return out.slice(0, 64);
};

/** `https://quiz.apps.chatic.io` → `https://app.chatic.io/apps/quiz`; anything else keeps its own origin. */
const mockAppLink = (origin: string): string => {
    const match = /^https:\/\/([a-z0-9-]+)\.(apps|apps-dev)\.chatic\.io$/.exec(origin);
    if (!match) return origin;
    return `https://${match[2] === 'apps' ? 'app' : 'app-dev'}.chatic.io/apps/${match[1]}`;
};

/**
 * Turns a browser tab into a stand-in for the app, so a page can be built and tried without it. Call
 * it before `connect`, in development only. It answers as the app does — the base set, plus what
 * `permissions` grants, and `NOT_FOUND` for the rest — and lets the developer play the user's side
 * through the returned controller.
 *
 * It is a stand-in, not the app: the share sheet is logged rather than shown, the user key is not the
 * app's, and nothing here proves a page works on a device.
 */
export const installChaticAppsMock = (options: MockOptions = {}): MockController => {
    const permissions = options.permissions ?? [];
    const reads = permissions.some(permission => RUNTIME_PERMISSIONS.includes(permission));
    const supported = new Set<string>([
        ...BASE,
        ...permissions.flatMap(permission => GATED[permission] ?? []),
        ...(reads ? RUNTIME_REQUESTS : []),
    ]);
    const runtime = options.data ?? {};
    const runtimeStreams = new Map<string, { seq: number; stop: () => void }>();
    const sentMessages: MockSentMessage[] = [];
    // Numbers each send as it is asked for, so sends in flight together get their own ids.
    let sendNo = 0;
    // With `chatSend`, the send is open whatever `calls` holds — as in the app, where the permission
    // opens it — and answers with a made-up message unless `calls` gives its own answer.
    const sends = permissions.includes('chatSend');
    const calls: { [method: string]: ((...args: never[]) => unknown) | undefined } = { ...runtime.calls };
    const ownSendAnswer = calls[SEND_METHOD];
    const madeUpSend = (input: { channelId: string; content: string }, no: number): CloudChat => {
        const now = Date.now();
        return {
            id: `mock-chat-${no}`,
            cid: 'mock-cloud',
            channelId: input.channelId,
            chatNo: no,
            isPending: false,
            isFailed: false,
            createdAtMs: now,
            updatedAtMs: now,
            stereo: 'user',
            content: input.content,
        };
    };
    if (sends && !ownSendAnswer) calls[SEND_METHOD] = madeUpSend as (...args: never[]) => unknown;
    if (!sends) delete calls[SEND_METHOD];
    // With `chatReact`, the same for a reaction: open, recorded, and answered with the message's row.
    const reacts = permissions.includes('chatReact');
    const reactions: MockReaction[] = [];
    const ownReactAnswer = calls[REACT_METHOD];
    const madeUpReaction = (input: { chatId: string }): CloudChat => {
        const now = Date.now();
        return {
            id: input.chatId,
            cid: 'mock-cloud',
            channelId: 'mock-room',
            chatNo: 1,
            isPending: false,
            isFailed: false,
            createdAtMs: now,
            updatedAtMs: now,
        };
    };
    if (reacts && !ownReactAnswer) calls[REACT_METHOD] = madeUpReaction as (...args: never[]) => unknown;
    if (!reacts) delete calls[REACT_METHOD];
    let cloudChanged = false;
    // Each device starts unasked, as on a fresh install.
    const devices: Record<DeviceKind, PermissionState> = { camera: 'prompt', microphone: 'prompt' };
    const origin = window.location.origin;
    // The global is a snapshot, as the app's is; a change reaches the page as a push only.
    const context: ChaticAppsContext = {
        protocolVersion: 1,
        viewId: 'mock-view',
        platform: 'ios',
        appVersion: '0.0.0-mock',
        locale: 'ko',
        theme: 'light',
        params: {},
        appLink: mockAppLink(origin),
        display: 'clean',
        ...options.context,
    };
    // An immersive page lies under the system bars; a padded one never meets them.
    const immersive = context.display === 'immersive';
    let portrait = true;
    // Given as `undefined`, a field stays absent, as from an app older than 2.30.0.
    if (!(options.context && 'safeArea' in options.context)) context.safeArea = immersive ? PORTRAIT_INSETS : NO_INSETS;
    for (const field of ['display', 'safeArea'] as const) if (context[field] === undefined) delete context[field];
    const applyInsets = (insets: SafeArea | undefined) => {
        if (!insets || !immersive || typeof document === 'undefined') return;
        for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
            document.documentElement.style.setProperty(`--chatic-safe-area-inset-${edge}`, `${insets[edge]}px`);
        }
    };
    applyInsets(context.safeArea);
    const log =
        options.log === false ? () => undefined : (...args: unknown[]) => console.info('[chatic-apps mock]', ...args);

    let ready = false;
    const held: string[] = [];
    let title: string | undefined;
    let closed: { by: 'page' | 'user'; result?: unknown } | null = null;
    const current = { theme: context.theme, locale: context.locale, safeArea: context.safeArea };
    let backClaimed = false;
    let guard = false;
    let askedAt: number | null = null;
    let reports = 0;
    const stored = new Map<string, string>();
    const storeFile: StoreFile = {
        read: key => stored.get(key),
        write: (key, json) => void stored.set(key, json),
        delete: key => void stored.delete(key),
        keys: () => [...stored.keys()],
    };
    const store = ruledStore(storeFile);
    if (options.storage && !store.set(options.storage).ok) {
        throw new Error('[chatic-apps mock] options.storage must be JSON entries within the storage limits.');
    }

    const deliver = (message: object) => {
        const raw = JSON.stringify(message);
        if (!ready) {
            held.push(raw);
            return;
        }
        // Asynchronous, as the WebView is.
        setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data: raw })), 0);
    };
    const push = (type: string, data: object) =>
        deliver({ type, success: true, data, refId: `mock-push-${Date.now().toString(36)}` });
    const ok = (type: string, refId: unknown, data: object = {}) => deliver({ type, success: true, data, refId });
    const fail = (type: string, refId: unknown, code: string, message: string, details?: object) =>
        deliver({
            type,
            success: false,
            error: details === undefined ? { code, message } : { code, message, details },
            refId,
        });

    const handle = (raw: string) => {
        let message: { type?: string; data?: Record<string, unknown>; refId?: unknown };
        try {
            message = JSON.parse(raw);
        } catch {
            return;
        }
        const { type, refId } = message;
        if (typeof type !== 'string') return;
        const data = message.data ?? {};
        if (!ready) {
            ready = true;
            held.splice(0).forEach(heldRaw =>
                setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data: heldRaw })), 0)
            );
        }
        log('←', type, data);
        // The view is gone: the app answers `NOT_OPEN` to a second finish, and nothing else at all.
        if (closed) {
            if (type === 'FinishSubWebView') {
                return fail('OnFinishSubWebView', refId, 'NOT_OPEN', 'The view has closed.');
            }
            return log('view closed; no answer to', type);
        }
        if (raw.length > MESSAGE_LIMIT) {
            return fail('ERROR', refId, 'TOO_LARGE', 'The message is over 65,536 characters.');
        }
        if (!supported.has(type)) return fail('ERROR', refId, 'NOT_FOUND', `${type} is not answered for this page.`);

        switch (type) {
            case 'WebAppReady':
                return ok('OnWebAppReady', refId, {
                    appVersion: SDK_BRIDGE_VERSION,
                    protocolVersion: SDK_BRIDGE_VERSION,
                    supportedWebMessages: [...supported],
                    supportedAppMessages: [],
                    subWebView: { ...context, ...current },
                });
            case 'Ping':
                return ok('Pong', refId, { payload: data.payload ?? '' });
            case 'FinishSubWebView':
                if (!fitsJson(data.result, RESULT_LIMIT)) {
                    return fail('OnFinishSubWebView', refId, 'INVALID', 'result must be JSON of at most 16 KiB.');
                }
                closed = { by: 'page', result: data.result };
                options.onClose?.(closed);
                log('view finished', data.result);
                return ok('OnFinishSubWebView', refId);
            case 'SetSubWebViewTitle': {
                const next = typeof data.title === 'string' ? data.title.trim() : '';
                if (!next || next.length > 100) {
                    return fail('OnSetSubWebViewTitle', refId, 'INVALID', 'title must be 1 to 100 characters.');
                }
                title = next;
                return ok('OnSetSubWebViewTitle', refId);
            }
            case 'TriggerHaptic':
                if (!KINDS.includes(data.kind as HapticKind)) {
                    return fail('OnTriggerHaptic', refId, 'INVALID_KIND', `Unknown haptic kind: ${String(data.kind)}`);
                }
                return ok('OnTriggerHaptic', refId);
            case 'SetCanGoBack':
                if (typeof data.canGoBack !== 'boolean') {
                    return fail('OnSetCanGoBack', refId, 'INVALID', 'canGoBack must be a boolean.');
                }
                backClaimed = data.canGoBack;
                return ok('OnSetCanGoBack', refId);
            case 'SetSubWebViewCloseGuard':
                if (typeof data.enabled !== 'boolean') {
                    return fail('OnSetSubWebViewCloseGuard', refId, 'INVALID', 'enabled must be a boolean.');
                }
                guard = data.enabled;
                return ok('OnSetSubWebViewCloseGuard', refId);
            case 'ReportSubWebViewError':
                if (typeof data.message !== 'string' || !data.message.trim()) {
                    return fail('OnReportSubWebViewError', refId, 'INVALID', 'message must be a non-empty string.');
                }
                if (reports >= 20) return ok('OnReportSubWebViewError', refId, { recorded: false });
                reports += 1;
                console.warn('[chatic-apps mock] page error', data.message, data.stack ?? '');
                return ok('OnReportSubWebViewError', refId, { recorded: true });
            case 'CopyToClipboard':
                if (typeof data.text !== 'string') {
                    return fail('OnCopyToClipboard', refId, 'INVALID', 'text must be a string.');
                }
                void navigator.clipboard?.writeText(data.text).catch(() => undefined);
                return ok('OnCopyToClipboard', refId, { copied: true });
            case 'OpenURL':
                if (typeof data.url !== 'string' || !openable(data.url)) {
                    return fail('OnOpenURL', refId, 'LINK_NOT_ALLOWED', 'This link cannot be opened from a page.');
                }
                window.open(data.url, '_blank', 'noopener,noreferrer');
                return ok('OnOpenURL', refId);
            case 'OpenShareSheet': {
                const { title: shareTitle, message: shareMessage, url } = data;
                const blank = !(typeof shareMessage === 'string' && shareMessage.trim()) && url == null;
                if (
                    !textWithin(shareTitle, 100) ||
                    !textWithin(shareMessage, 4000) ||
                    !textWithin(url, 2048) ||
                    url === '' ||
                    blank
                ) {
                    return fail('OnOpenShareSheet', refId, 'INVALID', 'Share a message or a url within their limits.');
                }
                if (typeof url === 'string' && !/^https?:\/\//i.test(url)) {
                    return fail(
                        'OnOpenShareSheet',
                        refId,
                        'LINK_NOT_ALLOWED',
                        'Only an http or https url can be shared.'
                    );
                }
                log('share sheet', data);
                return ok('OnOpenShareSheet', refId, { action: 'sharedAction', activityType: null });
            }
            case 'GetSubWebViewStorage':
            case 'SetSubWebViewStorage':
            case 'RemoveSubWebViewStorage':
            case 'ClearSubWebViewStorage':
            case 'GetSubWebViewStorageInfo': {
                const calls = {
                    GetSubWebViewStorage: () => store.get(data.keys),
                    SetSubWebViewStorage: () => store.set(data.entries),
                    RemoveSubWebViewStorage: () => store.remove(data.keys),
                    ClearSubWebViewStorage: () => store.clear(),
                    GetSubWebViewStorageInfo: () => store.info(),
                };
                const outcome = calls[type]();
                if (outcome.ok) return ok(`On${type}`, refId, outcome.value);
                return fail(
                    `On${type}`,
                    refId,
                    outcome.code,
                    outcome.code === 'QUOTA_EXCEEDED'
                        ? "This would take the page's storage past 1,048,576 characters."
                        : 'Keys are 1 to 200 characters; values must be JSON.'
                );
            }
            case 'GetSubWebViewPermission':
            case 'RequestSubWebViewPermission': {
                const kind = data.kind as DeviceKind;
                if (!DEVICE_KINDS.includes(kind)) {
                    return fail(`On${type}`, refId, 'INVALID', 'kind must be camera or microphone.');
                }
                if (options.deviceAnswers?.[kind] === 'unavailable') {
                    return fail(`On${type}`, refId, 'UNAVAILABLE', 'This device has no such hardware.');
                }
                if (type === 'RequestSubWebViewPermission' && devices[kind] === 'prompt') {
                    const answer = options.deviceAnswers?.[kind] ?? 'allow';
                    // A refusal leaves the OS willing to ask again, as the app's `prompt` says.
                    devices[kind] = answer === 'allow' ? 'granted' : answer === 'deny' ? 'prompt' : 'blocked';
                    log('the user answered', kind, answer);
                }
                return ok(`On${type}`, refId, { state: devices[kind] });
            }
            case 'OpenSettings':
                log('settings opened');
                return ok('OnOpenSettings', refId);
            case 'GetSubWebViewUserKey':
                return ok('OnGetSubWebViewUserKey', refId, { key: options.userKey ?? mockKey(origin) });
            case 'RuntimeHello':
            case 'RuntimeCall':
            case 'RuntimeSubscribe':
            case 'RuntimeUnsubscribe':
                return answerRuntime(type, refId, data);
            default:
                return fail('ERROR', refId, 'NOT_FOUND', `${type} is not answered for this page.`);
        }
    };

    function answerRuntime(type: string, refId: unknown, data: Record<string, unknown>): void {
        const reply = `On${type}`;
        if (cloudChanged && type !== 'RuntimeUnsubscribe') {
            return fail(reply, refId, 'CLOUD_CHANGED', 'The cloud this view opened on is no longer the selected one.');
        }
        const method = String(type === 'RuntimeSubscribe' ? data.topic : data.method);
        const args = (Array.isArray(data.args) ? data.args : []).filter(
            arg => !(typeof arg === 'object' && arg !== null && (arg as { $listener?: unknown }).$listener === true)
        );
        switch (type) {
            case 'RuntimeHello':
                if (runtime.consent === 'refuse') {
                    return fail(
                        reply,
                        refId,
                        'CONSENT_REFUSED',
                        'The user did not allow this page to read this cloud.'
                    );
                }
                return ok(reply, refId, {
                    sessionOwner: 'native',
                    contract: 1,
                    seq: 0,
                    session: permissions.includes('session') ? (runtime.session ?? null) : null,
                    allowed: { calls: Object.keys(calls), streams: Object.keys(runtime.streams ?? {}) },
                });
            case 'RuntimeCall': {
                const call = calls[method] as ((...args: unknown[]) => unknown) | undefined;
                if (data.target !== 'data' || !call) {
                    return fail(reply, refId, 'RUNTIME_NOT_ALLOWED', `${method} is not open to this page.`);
                }
                if (method === REACT_METHOD) return answerReaction(reply, refId, method, call, args);
                if (method !== SEND_METHOD) {
                    return void Promise.resolve()
                        .then(() => call(...args))
                        .then(
                            value => ok(reply, refId, { value: value ?? null }),
                            error => fail(reply, refId, 'RUNTIME_ERROR', String((error as Error)?.message ?? error))
                        );
                }
                // The app's own checks on a send's shape: one argument, only a room and plain text. The
                // room's place and the send budget are the app's alone.
                const input = args[0] as { channelId?: unknown; content?: unknown } | undefined;
                const room = input?.channelId;
                const text = input?.content;
                const plain =
                    args.length === 1 &&
                    typeof input === 'object' &&
                    input !== null &&
                    Object.keys(input).every(key => key === 'channelId' || key === 'content') &&
                    typeof room === 'string' &&
                    room.trim() !== '' &&
                    room.length <= ROOM_ID_LIMIT &&
                    typeof text === 'string' &&
                    text.trim() !== '' &&
                    text.length <= SEND_LIMIT;
                if (!plain) {
                    return fail(reply, refId, 'RUNTIME_NOT_ALLOWED', 'Only plain text, up to 1000 characters.', {
                        target: 'data',
                        method,
                        reason: 'guard',
                    });
                }
                const no = ++sendNo;
                return void Promise.resolve()
                    .then(() => (ownSendAnswer ? call(...args) : madeUpSend({ channelId: room, content: text }, no)))
                    .then(
                        value => {
                            // Recorded once it went through: a send the answer failed was not sent.
                            sentMessages.push({ channelId: room, text });
                            log('message sent', room, text);
                            ok(reply, refId, { value: value ?? null });
                        },
                        error => fail(reply, refId, 'RUNTIME_ERROR', String((error as Error)?.message ?? error))
                    );
            }
            case 'RuntimeSubscribe': {
                const open = runtime.streams?.[method] as
                    | ((emit: (...event: unknown[]) => void, ...args: unknown[]) => (() => void) | void)
                    | undefined;
                const id = String(data.subscriptionId);
                if (data.target !== 'data' || !open) {
                    return fail(reply, refId, 'RUNTIME_NOT_ALLOWED', `${method} is not open to this page.`);
                }
                runtimeStreams.get(id)?.stop();
                const entry = { seq: 0, stop: () => undefined as void };
                runtimeStreams.set(id, entry);
                const emit = (...event: unknown[]) => {
                    if (runtimeStreams.get(id) !== entry) return;
                    entry.seq += 1;
                    push('OnRuntimeEvent', { subscriptionId: id, seq: entry.seq, event });
                };
                entry.stop = open(emit, ...args) ?? (() => undefined);
                return ok(reply, refId);
            }
            default: {
                const id = String(data.subscriptionId);
                runtimeStreams.get(id)?.stop();
                runtimeStreams.delete(id);
                return ok(reply, refId);
            }
        }
    }

    // The app's own checks on a reaction's shape: one argument, only a message, one emoji and on or off.
    // The message's place, whether it takes reactions, and the reaction budget are the app's alone.
    function answerReaction(
        reply: string,
        refId: unknown,
        method: string,
        call: (...args: unknown[]) => unknown,
        args: unknown[]
    ): void {
        const input = args[0] as { chatId?: unknown; emoji?: unknown; action?: unknown } | undefined;
        const chatId = input?.chatId;
        const emoji = input?.emoji;
        const action = input?.action;
        const valid =
            args.length === 1 &&
            typeof input === 'object' &&
            input !== null &&
            Object.keys(input).every(key => key === 'chatId' || key === 'emoji' || key === 'action') &&
            typeof chatId === 'string' &&
            chatId.trim() !== '' &&
            chatId.length <= MESSAGE_ID_LIMIT &&
            typeof emoji === 'string' &&
            isOneReactionCharacter(emoji) &&
            (action === 'on' || action === 'off');
        if (!valid) {
            return fail(reply, refId, 'RUNTIME_NOT_ALLOWED', 'One emoji, on or off, on one message.', {
                target: 'data',
                method,
                reason: 'guard',
            });
        }
        return void Promise.resolve()
            .then(() => (ownReactAnswer ? call(...args) : madeUpReaction({ chatId })))
            .then(
                value => {
                    reactions.push({ messageId: chatId, emoji, on: action === 'on' });
                    log('reaction', action, chatId, emoji);
                    ok(reply, refId, { value: value ?? null });
                },
                error => fail(reply, refId, 'RUNTIME_ERROR', String((error as Error)?.message ?? error))
            );
    }

    const target = window as unknown as {
        ReactNativeWebView?: { postMessage(message: string): void };
        ChaticSubWebView?: ChaticAppsContext;
    };
    target.ReactNativeWebView = { postMessage: handle };
    target.ChaticSubWebView = context;

    const controller: MockController = {
        get title() {
            return title;
        },
        get closed() {
            return closed;
        },
        get storage() {
            return Object.fromEntries([...stored].map(([key, json]) => [key, JSON.parse(json)]));
        },
        get devices() {
            return { ...devices };
        },
        get sentMessages() {
            return [...sentMessages];
        },
        get reactions() {
            return [...reactions];
        },
        pressBack: () => {
            if (closed) return;
            if (backClaimed) push('OnBackPressed', {});
            else if (history.length > 1) history.back();
            else controller.requestClose('back');
        },
        requestClose: (trigger = 'control') => {
            if (closed) return;
            const now = Date.now();
            if (guard && (askedAt === null || now - askedAt > FORCE_WINDOW_MS)) {
                askedAt = now;
                push('OnSubWebViewCloseRequested', { trigger });
                return;
            }
            closed = { by: 'user' };
            options.onClose?.(closed);
            log('view closed by the user');
        },
        changeContext: change => {
            Object.assign(current, change);
            push('OnSubWebViewContextChanged', { ...current });
        },
        // The phone's own insets, upright and turned, whatever `context.safeArea` started with; pushed at
        // once, where the app waits for the insets to hold still for 200 ms.
        rotate: () => {
            portrait = !portrait;
            if (!immersive || !current.safeArea) return;
            current.safeArea = portrait ? PORTRAIT_INSETS : LANDSCAPE_INSETS;
            applyInsets(current.safeArea);
            push('OnSubWebViewContextChanged', { ...current });
        },
        changeCloud: () => {
            if (cloudChanged) return;
            cloudChanged = true;
            runtimeStreams.forEach((entry, id) => {
                entry.stop();
                push('OnRuntimeEvent', {
                    subscriptionId: id,
                    seq: entry.seq + 1,
                    event: { $ended: { code: 'CLOUD_CHANGED', message: 'The cloud changed.' } },
                });
            });
            runtimeStreams.clear();
        },
        uninstall: () => {
            delete target.ReactNativeWebView;
            delete target.ChaticSubWebView;
        },
    };
    return controller;
};
