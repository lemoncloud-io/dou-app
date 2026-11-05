import type { SubWebViewErrorCode, WebMessageData } from '@chatic/bridge-messages';
import type { IAppBridgeHost } from '@chatic/bridges';

import type { ISubWebViewService } from '../../services';

const ERROR_MESSAGES: Record<SubWebViewErrorCode, string> = {
    INVALID:
        'An https url is required; title must be a string, params a JSON object of at most 16 KiB and appId one lower-case label.',
    NOT_ALLOWED: 'The url is not on the sub WebView allowlist.',
    ALREADY_OPEN: 'A sub WebView is already showing.',
    NOT_OPEN: 'No sub WebView with this viewId is showing.',
};

const failure = <T extends 'OnOpenSubWebView' | 'OnCloseSubWebView'>(type: T, code: SubWebViewErrorCode) => ({
    type,
    success: false,
    error: { code, message: ERROR_MESSAGES[code] },
});

/** The main WebView's side of the sub WebView: open and close on the web's request. */
export const createSubWebViewHandlers = (service: ISubWebViewService) => {
    const handleOpenSubWebView = async (message: WebMessageData<'OpenSubWebView'>) => {
        const result = service.open({
            url: message.data?.url,
            title: message.data?.title,
            params: message.data?.params,
            appId: message.data?.appId,
        });
        if (!result.ok) return failure('OnOpenSubWebView' as const, result.code);
        return { type: 'OnOpenSubWebView' as const, success: true, data: { viewId: result.view.viewId } };
    };

    const handleCloseSubWebView = async (message: WebMessageData<'CloseSubWebView'>) => {
        const result = service.close(message.data?.viewId, 'host');
        if (!result.ok) return failure('OnCloseSubWebView' as const, result.code);
        return { type: 'OnCloseSubWebView' as const, success: true, data: {} };
    };

    return { handleOpenSubWebView, handleCloseSubWebView };
};

/**
 * Tells the web each time a view closes. A close the service marks `notifyHost: false` — the web
 * reloaded under the view — is not sent: the page that opened the view is gone.
 */
export const forwardSubWebViewClosed = (service: ISubWebViewService, bridge: IAppBridgeHost) =>
    service.subscribe(event => {
        if (event.type !== 'closed' || !event.notifyHost) return;
        bridge.pushEvent({
            type: 'OnSubWebViewClosed',
            success: true,
            data: {
                viewId: event.viewId,
                reason: event.reason,
                ...(event.result !== undefined ? { result: event.result } : {}),
            },
        });
    });
