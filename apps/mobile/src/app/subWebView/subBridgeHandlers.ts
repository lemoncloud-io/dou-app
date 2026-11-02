import type {
    HapticKind,
    OpenShareSheetPayload,
    SubWebViewRequestType,
    WebMessageData,
    WebMessageHandlerResponse,
} from '@chatic/bridge-messages';
import type { ShareAction } from 'react-native';

import type { IHapticBridge } from '../bridge';
import type { IClipboardService, ISubWebViewService } from '../services';
import { SUB_WEBVIEW_TITLE_LIMIT } from '../services/subWebView/subWebViewData';
import { originOf } from '../utils/url';
import { decideSubWebViewNavigation } from './subWebViewNavigation';

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
}

const HAPTIC_KINDS: readonly HapticKind[] = ['selection', 'impact'];

/** Caps on what a page may put in the share sheet; far above what a share needs. */
const SHARE_TITLE_LIMIT = 100;
const SHARE_MESSAGE_LIMIT = 4000;
const SHARE_URL_LIMIT = 2048;

/**
 * A field the page may leave out — absent or `null`, which JSON serializers emit for a missing value —
 * or a string within `limit`; `null` when it is neither.
 */
const optionalText = (value: unknown, limit: number): string | undefined | null => {
    if (value == null) return undefined;
    return typeof value === 'string' && value.length <= limit ? value : null;
};

const fail = <T extends string>(type: T, code: string, message: string) => ({
    type,
    success: false,
    error: { code, message },
});

/**
 * The page-facing handlers. Written for this host rather than borrowed from the main WebView's, which
 * the boundary forbids and which assume the main web is asking — the main `OpenURL` opens the app's
 * own schemes, which a page must not.
 */
export const createSubBridgeHandlers = (deps: SubBridgeDeps): SubBridgeHandlers => ({
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
            return fail('OnCopyToClipboard', 'CLIPBOARD_WRITE_ERROR', (e as Error)?.message ?? 'Failed to copy text.');
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
            return fail('OnOpenShareSheet', 'SHARE_ERROR', (e as Error)?.message ?? 'Failed to open the share sheet.');
        }
    },
});
