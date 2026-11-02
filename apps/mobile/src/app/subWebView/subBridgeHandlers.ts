import type {
    HapticKind,
    SubWebViewRequestType,
    WebMessageData,
    WebMessageHandlerResponse,
} from '@chatic/bridge-messages';

import type { IHapticBridge } from '../bridge';
import type { IClipboardService, ISubWebViewService } from '../services';
import { SUB_WEBVIEW_TITLE_LIMIT } from '../services/subWebView/subWebViewData';
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
}

const HAPTIC_KINDS: readonly HapticKind[] = ['selection', 'impact'];

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
});
