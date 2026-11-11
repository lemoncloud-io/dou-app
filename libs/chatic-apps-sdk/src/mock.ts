import { ruledStore, type StoreFile } from './storage';
import type { ChaticAppsContext, CloseTrigger, DeviceKind, HapticKind, PermissionState } from './types';

/** A manifest permission, as the page would declare it in `/.well-known/chatic-app.json`. */
export type MockPermission = 'clipboard' | 'share' | 'openUrl' | 'userKey';

/** How the user answers when the page asks for a device: allows it, refuses it, or the OS blocks it. */
export type MockDeviceAnswer = 'allow' | 'deny' | 'blocked' | 'unavailable';

export interface MockOptions {
    /** What the page's manifest would grant. None by default, as for a page with no manifest. */
    permissions?: MockPermission[];
    /** Overrides for the context the page gets; the rest is filled in. */
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
const GATED: Record<MockPermission, string> = {
    clipboard: 'CopyToClipboard',
    share: 'OpenShareSheet',
    openUrl: 'OpenURL',
    userKey: 'GetSubWebViewUserKey',
};
const DEVICE_KINDS: readonly DeviceKind[] = ['camera', 'microphone'];
const KINDS: readonly HapticKind[] = ['selection', 'impact', 'success', 'warning', 'error'];
const MESSAGE_LIMIT = 64 * 1024;
const RESULT_LIMIT = 16 * 1024;
const FORCE_WINDOW_MS = 3000;

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
    const supported = new Set([...BASE, ...(options.permissions ?? []).map(permission => GATED[permission])]);
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
        ...options.context,
    };
    const log =
        options.log === false ? () => undefined : (...args: unknown[]) => console.info('[chatic-apps mock]', ...args);

    let ready = false;
    const held: string[] = [];
    let title: string | undefined;
    let closed: { by: 'page' | 'user'; result?: unknown } | null = null;
    const current = { theme: context.theme, locale: context.locale };
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
    const fail = (type: string, refId: unknown, code: string, message: string) =>
        deliver({ type, success: false, error: { code, message }, refId });

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
                    appVersion: '2.23.0',
                    protocolVersion: '2.23.0',
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
            default:
                return fail('ERROR', refId, 'NOT_FOUND', `${type} is not answered for this page.`);
        }
    };

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
        uninstall: () => {
            delete target.ReactNativeWebView;
            delete target.ChaticSubWebView;
        },
    };
    return controller;
};
