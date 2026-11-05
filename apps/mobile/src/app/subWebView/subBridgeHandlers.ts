import type {
    OpenShareSheetPayload,
    SubWebViewDeviceKind,
    SubWebViewPermission,
    SubWebViewRequestType,
    WebMessageData,
    WebMessageHandlerResponse,
} from '@chatic/bridge-messages';
import type { ShareAction } from 'react-native';

import type { IHapticBridge } from '../bridge';
import { HAPTIC_KINDS } from '../bridge/hapticKinds';
import type { IClipboardService, IPermissionService, ISubWebViewService } from '../services';
import { SUB_WEBVIEW_TITLE_LIMIT } from '../services/subWebView/subWebViewData';
import {
    SUB_WEBVIEW_STORAGE_LIMIT,
    type StorageResult,
    type SubWebViewStorage,
} from '../services/subWebView/subWebViewStorage';
import { originOf } from '../utils/url';
import { decideSubWebViewNavigation } from './subWebViewNavigation';
import { deriveSubWebViewUserKey } from './subWebViewUserKey';

/** The requests this table answers: the subset minus the two the host answers itself. */
export type SubBridgeRequestType = Exclude<SubWebViewRequestType, 'WebAppReady' | 'Ping'>;

/**
 * One handler per request a sub WebView page may send. Typed by the subset, so a request outside it
 * cannot be added here without failing to compile.
 */
export type SubBridgeHandlers = {
    [K in SubBridgeRequestType]: (message: WebMessageData<K>) => Promise<WebMessageHandlerResponse<K>>;
};

export interface SubBridgeDeps {
    /** The view this page is in; the page can only ever finish this one. */
    viewId: string;
    service: Pick<ISubWebViewService, 'close'>;
    clipboard: IClipboardService;
    haptic: IHapticBridge;
    openExternal: (url: string) => Promise<void>;
    setTitle: (title: string) => void;
    openShareSheet: (data: Pick<OpenShareSheetPayload, 'title' | 'message' | 'url'>) => Promise<ShareAction>;
    /** The origin the view was opened on, from the shell's own record; `null` when it has none. */
    origin: string | null;
    /** The device id the main WebView is given too; read only when a page asks for its key. */
    getDeviceId: () => string | null | undefined;
    /** Whether the page takes Android back for itself; reset by the view on each page load. */
    setBackClaim: (claimed: boolean) => void;
    /** Whether the user's close is asked of the page first; reset by the view on each page load. */
    setCloseGuard: (enabled: boolean) => void;
    /** Writes a page's error report to the app's logs, under the opened origin. */
    logPageError: (report: { origin: string | null; message: string; stack?: string }) => void;
    /**
     * The opened origin's storage, opened on the first request that needs it; `null` when the view
     * has no origin to keep it under, or its file cannot be opened.
     */
    openStorage: () => Pick<SubWebViewStorage, 'get' | 'set' | 'remove' | 'clear' | 'info'> | null;
    /** The OS permissions behind the camera and the microphone. */
    permissions: Pick<IPermissionService, 'status' | 'request'>;
    /** Opens DoU's own page in the OS settings; `false` when the OS would not. */
    openSettings: () => Promise<boolean>;
}

/**
 * The request each manifest permission unlocks. Every other request in the subset is the base set: it
 * reaches nothing outside the view, so every page has it.
 */
export const PERMISSION_REQUESTS: Readonly<Record<SubWebViewPermission, SubBridgeRequestType>> = {
    clipboard: 'CopyToClipboard',
    share: 'OpenShareSheet',
    openUrl: 'OpenURL',
    userKey: 'GetSubWebViewUserKey',
};

/**
 * The handlers a page with `permissions` gets: the base set, and each permitted request. One left out
 * is not registered, so the handshake does not list it and the host answers it `NOT_FOUND`.
 */
export const permittedSubBridgeHandlers = (
    handlers: SubBridgeHandlers,
    permissions: ReadonlySet<SubWebViewPermission>
): Partial<SubBridgeHandlers> => {
    const permitted: Partial<SubBridgeHandlers> = { ...handlers };
    for (const [permission, request] of Object.entries(PERMISSION_REQUESTS) as [
        SubWebViewPermission,
        SubBridgeRequestType,
    ][]) {
        if (!permissions.has(permission)) delete permitted[request];
    }
    return permitted;
};

const OS_PERMISSION = { camera: 'CAMERA', microphone: 'MICROPHONE' } as const;

const isDeviceKind = (kind: unknown): kind is SubWebViewDeviceKind => kind === 'camera' || kind === 'microphone';

/** What react-native-device-info answers when it has no id to give. */
const NO_DEVICE_ID = 'unknown';

/** Caps on what a page may put in the share sheet; far above what a share needs. */
const SHARE_TITLE_LIMIT = 100;
const SHARE_MESSAGE_LIMIT = 4000;
const SHARE_URL_LIMIT = 2048;

/** What an error report keeps, and how many a page load may send. */
const ERROR_MESSAGE_LIMIT = 1000;
const ERROR_STACK_LIMIT = 4000;
const ERROR_REPORTS_PER_LOAD = 20;

/**
 * A field the page may leave out — absent or `null`, which JSON serializers emit for a missing value —
 * or a string within `limit`; `null` when it is neither.
 */
const optionalText = (value: unknown, limit: number): string | undefined | null => {
    if (value == null) return undefined;
    return typeof value === 'string' && value.length <= limit ? value : null;
};

const DEVICE_KIND_TEXT = 'kind must be camera or microphone.';
const NO_HARDWARE_TEXT = 'This device has no such hardware.';

const fail = <T extends string>(type: T, code: string, message: string) => ({
    type,
    success: false,
    error: { code, message },
});

/** A storage call's reply: its value, or its code, with a message for a developer. */
const storageReply = <T extends string, V>(type: T, result: StorageResult<V> | null) => {
    if (!result) return fail(type, 'UNAVAILABLE', 'This view has no storage.');
    if (result.ok) return { type, success: true as const, data: result.value };
    return fail(
        type,
        result.code,
        result.code === 'QUOTA_EXCEEDED'
            ? `This would take the page's storage past ${SUB_WEBVIEW_STORAGE_LIMIT} characters.`
            : 'Keys are 1 to 200 characters; values must be JSON.'
    );
};

/**
 * The page-facing handlers. Written for this host rather than borrowed from the main WebView's, which
 * the boundary forbids and which assume the main web is asking — the main `OpenURL` opens the app's
 * own schemes, which a page must not.
 */
export const createSubBridgeHandlers = (deps: SubBridgeDeps): SubBridgeHandlers => {
    // The handlers are built once per page load, so this counts that load's reports.
    let errorReports = 0;
    // A request in flight per kind: a page that asks twice (a double tap) gets the one answer instead of
    // putting the OS prompt up twice.
    const asking = new Map<SubWebViewDeviceKind, Promise<'GRANTED' | 'DENIED' | 'BLOCKED'>>();
    return {
        FinishSubWebView: async message => {
            const closed = deps.service.close(deps.viewId, 'page', message.data?.result);
            if (!closed.ok) {
                const text =
                    closed.code === 'INVALID'
                        ? 'result must be JSON of at most 16 KiB.'
                        : 'This view is no longer showing.';
                return fail('OnFinishSubWebView', closed.code, text);
            }
            return { type: 'OnFinishSubWebView', success: true, data: {} };
        },

        SetSubWebViewTitle: async message => {
            const title = typeof message.data?.title === 'string' ? message.data.title.trim() : '';
            if (!title || title.length > SUB_WEBVIEW_TITLE_LIMIT) {
                return fail('OnSetSubWebViewTitle', 'INVALID', 'title must be 1 to 100 characters.');
            }
            deps.setTitle(title);
            return { type: 'OnSetSubWebViewTitle', success: true, data: {} };
        },

        CopyToClipboard: async message => {
            const text = message.data?.text;
            if (typeof text !== 'string') return fail('OnCopyToClipboard', 'INVALID', 'text must be a string.');
            try {
                await deps.clipboard.setText(text);
                return { type: 'OnCopyToClipboard', success: true, data: { copied: true } };
            } catch (e) {
                return fail(
                    'OnCopyToClipboard',
                    'CLIPBOARD_WRITE_ERROR',
                    (e as Error)?.message ?? 'Failed to copy text.'
                );
            }
        },

        TriggerHaptic: async message => {
            const kind = message.data?.kind;
            if (!HAPTIC_KINDS.includes(kind)) {
                return fail('OnTriggerHaptic', 'INVALID_KIND', `Unknown haptic kind: ${String(kind)}`);
            }
            deps.haptic.trigger(kind);
            return { type: 'OnTriggerHaptic', success: true, data: {} };
        },

        // Only what the sub WebView would itself hand to the OS — web, mail, phone, SMS and the stores.
        // Never the app's own schemes or links, and never another sub WebView page.
        OpenURL: async message => {
            const url = message.data?.url;
            if (typeof url !== 'string' || decideSubWebViewNavigation({ url, isTopFrame: true }) !== 'external') {
                return fail('OnOpenURL', 'LINK_NOT_ALLOWED', 'This link cannot be opened from a sub WebView page.');
            }
            try {
                await deps.openExternal(url);
                return { type: 'OnOpenURL', success: true, data: {} };
            } catch (e) {
                return fail('OnOpenURL', 'OPEN_URL_FAILED', (e as Error)?.message ?? 'Failed to open the link.');
            }
        },

        // Text and a web link only. The link is not opened, so the app's own links may be shared like any
        // other text, but a `file:` URL would hand the OS a file from the app's container on iOS.
        OpenShareSheet: async message => {
            const title = optionalText(message.data?.title, SHARE_TITLE_LIMIT);
            const text = optionalText(message.data?.message, SHARE_MESSAGE_LIMIT);
            const url = optionalText(message.data?.url, SHARE_URL_LIMIT);
            if (title === null || text === null || url === null || url === '' || (!text?.trim() && !url)) {
                return fail(
                    'OnOpenShareSheet',
                    'INVALID',
                    'Share a message or a url; title, message and url must be strings within their limits.'
                );
            }
            if (url !== undefined && originOf(url) === null) {
                return fail('OnOpenShareSheet', 'LINK_NOT_ALLOWED', 'Only an http or https url can be shared.');
            }
            try {
                const result = await deps.openShareSheet({ title, message: text, url });
                return {
                    type: 'OnOpenShareSheet',
                    success: true,
                    data: { action: result.action, activityType: result.activityType ?? null },
                };
            } catch (e) {
                return fail(
                    'OnOpenShareSheet',
                    'SHARE_ERROR',
                    (e as Error)?.message ?? 'Failed to open the share sheet.'
                );
            }
        },

        // The main web's message, with the same meaning: while true, Android back is the page's.
        SetCanGoBack: async message => {
            const canGoBack = message.data?.canGoBack;
            if (typeof canGoBack !== 'boolean') {
                return fail('OnSetCanGoBack', 'INVALID', 'canGoBack must be a boolean.');
            }
            deps.setBackClaim(canGoBack);
            return { type: 'OnSetCanGoBack', success: true, data: {} };
        },

        SetSubWebViewCloseGuard: async message => {
            const enabled = message.data?.enabled;
            if (typeof enabled !== 'boolean') {
                return fail('OnSetSubWebViewCloseGuard', 'INVALID', 'enabled must be a boolean.');
            }
            deps.setCloseGuard(enabled);
            return { type: 'OnSetSubWebViewCloseGuard', success: true, data: {} };
        },

        // Keyed on the shell's record of the origin, never on anything in the message, so a page can only
        // ever get its own origin's key. With no id, an error rather than a key every such device shares.
        GetSubWebViewUserKey: async () => {
            const deviceId = deps.getDeviceId();
            if (!deps.origin || !deviceId || deviceId === NO_DEVICE_ID) {
                return fail('OnGetSubWebViewUserKey', 'UNAVAILABLE', 'This device has no id to derive a key from.');
            }
            return {
                type: 'OnGetSubWebViewUserKey',
                success: true,
                data: { key: deriveSubWebViewUserKey(deviceId, deps.origin) },
            };
        },

        // Cut to size rather than refused: a report is most wanted when the page is least able to fix it.
        ReportSubWebViewError: async message => {
            const text = message.data?.message;
            if (typeof text !== 'string' || !text.trim()) {
                return fail('OnReportSubWebViewError', 'INVALID', 'message must be a non-empty string.');
            }
            if (errorReports >= ERROR_REPORTS_PER_LOAD) {
                return { type: 'OnReportSubWebViewError', success: true, data: { recorded: false } };
            }
            errorReports += 1;
            const stack = message.data?.stack;
            deps.logPageError({
                origin: deps.origin,
                message: text.slice(0, ERROR_MESSAGE_LIMIT),
                ...(typeof stack === 'string' ? { stack: stack.slice(0, ERROR_STACK_LIMIT) } : {}),
            });
            return { type: 'OnReportSubWebViewError', success: true, data: { recorded: true } };
        },

        // Always the opened origin's storage, chosen by the view: nothing in a request names it.
        GetSubWebViewStorage: async message =>
            storageReply('OnGetSubWebViewStorage', deps.openStorage()?.get(message.data?.keys) ?? null),
        SetSubWebViewStorage: async message =>
            storageReply('OnSetSubWebViewStorage', deps.openStorage()?.set(message.data?.entries) ?? null),
        RemoveSubWebViewStorage: async message =>
            storageReply('OnRemoveSubWebViewStorage', deps.openStorage()?.remove(message.data?.keys) ?? null),
        ClearSubWebViewStorage: async () =>
            storageReply('OnClearSubWebViewStorage', deps.openStorage()?.clear() ?? null),
        GetSubWebViewStorageInfo: async () =>
            storageReply('OnGetSubWebViewStorageInfo', deps.openStorage()?.info() ?? null),

        // Where DoU stands with the OS, read without asking. A denied permission that may still be asked
        // for reads `prompt`: to a page, "asking would show the OS prompt" is what matters.
        GetSubWebViewPermission: async message => {
            const kind = message.data?.kind;
            if (!isDeviceKind(kind)) return fail('OnGetSubWebViewPermission', 'INVALID', DEVICE_KIND_TEXT);
            const status = await deps.permissions.status(OS_PERMISSION[kind]);
            if (status === 'UNAVAILABLE') return fail('OnGetSubWebViewPermission', 'UNAVAILABLE', NO_HARDWARE_TEXT);
            return {
                type: 'OnGetSubWebViewPermission',
                success: true,
                data: { state: status === 'GRANTED' ? 'granted' : status === 'BLOCKED' ? 'blocked' : 'prompt' },
            };
        },

        // The OS prompt, under DoU's name: the page asks when the user reaches for the feature, so the
        // prompt does not arrive in the middle of a capture.
        RequestSubWebViewPermission: async message => {
            const kind = message.data?.kind;
            if (!isDeviceKind(kind)) return fail('OnRequestSubWebViewPermission', 'INVALID', DEVICE_KIND_TEXT);
            if ((await deps.permissions.status(OS_PERMISSION[kind])) === 'UNAVAILABLE') {
                return fail('OnRequestSubWebViewPermission', 'UNAVAILABLE', NO_HARDWARE_TEXT);
            }
            let pending = asking.get(kind);
            if (!pending) {
                pending = deps.permissions.request(OS_PERMISSION[kind]).finally(() => asking.delete(kind));
                asking.set(kind, pending);
            }
            const result = await pending;
            return {
                type: 'OnRequestSubWebViewPermission',
                success: true,
                data: { state: result === 'GRANTED' ? 'granted' : result === 'BLOCKED' ? 'blocked' : 'prompt' },
            };
        },

        // DoU's own page in the OS settings, where a blocked permission can be turned back on.
        OpenSettings: async () => {
            if (!(await deps.openSettings())) {
                return fail('OnOpenSettings', 'SETTINGS_ERROR', 'Could not open the system settings.');
            }
            return { type: 'OnOpenSettings', success: true, data: {} };
        },
    };
};
