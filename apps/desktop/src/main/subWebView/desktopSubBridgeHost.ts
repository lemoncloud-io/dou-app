import type { SubWebViewContext } from '@chatic/bridge-messages';
import { AppBridgeHost, type IAppBridgeHost } from '@chatic/bridges';
import { SUB_WEBVIEW_MESSAGE_LIMIT, SUB_WEBVIEW_TITLE_LIMIT } from '@chatic/shared/subWebViewTrust';

import type { DesktopSubWebViewService } from './DesktopSubWebViewService';

/** What an error report keeps, and how many a page load may send — the phone shell's numbers. */
const ERROR_MESSAGE_LIMIT = 1000;
const ERROR_STACK_LIMIT = 4000;
const ERROR_REPORTS_PER_LOAD = 20;

export interface DesktopSubBridgeDeps {
    service: Pick<DesktopSubWebViewService, 'close'>;
    viewId: string;
    /** The origin the view was opened on; what an error report is filed under. */
    origin: string;
    getContext: () => SubWebViewContext;
    /** Show `title` in the bar — the window decides whether an external page's request counts. */
    setTitle: (title: string) => void;
    logPageError: (report: { origin: string; message: string; stack?: string }) => void;
}

const fail = <T extends string>(type: T, code: string, message: string) => ({
    type,
    success: false,
    error: { code, message },
});

/**
 * The sub view's own host, one per page load. It is not the main window's host and borrows none of
 * its handlers: a page reaches the shell for the few requests below and nothing else, so the
 * handshake lists exactly `WebAppReady`, `Ping` (which the host answers itself) and these three. Every
 * other request — the device, storage, sharing, the clipboard, the user key — is answered `NOT_FOUND`
 * on the desktop for now, whatever the page's manifest declares.
 *
 * Built with no cache schema, no cache types and no `onAppReady`, so its handshake reports no local
 * storage and drives none of the main window's boot. It reports the page's context, and refuses a
 * message over the page's size limit.
 */
export const createDesktopSubBridgeHost = (
    sendToWeb: (message: string) => void,
    deps: DesktopSubBridgeDeps
): IAppBridgeHost => {
    const host = new AppBridgeHost({
        sendToWeb,
        subWebViewContext: deps.getContext,
        maxMessageLength: SUB_WEBVIEW_MESSAGE_LIMIT,
    });
    let errorReports = 0;

    host.registerHandler('FinishSubWebView', async message => {
        const closed = deps.service.close(deps.viewId, 'page', message.data?.result);
        if (!closed.ok) {
            const text =
                closed.code === 'INVALID'
                    ? 'result must be JSON of at most 16 KiB.'
                    : 'This view is no longer showing.';
            return fail('OnFinishSubWebView', closed.code, text);
        }
        return { type: 'OnFinishSubWebView', success: true, data: {} };
    });

    host.registerHandler('SetSubWebViewTitle', async message => {
        const title = typeof message.data?.title === 'string' ? message.data.title.trim() : '';
        if (!title || title.length > SUB_WEBVIEW_TITLE_LIMIT) {
            return fail('OnSetSubWebViewTitle', 'INVALID', 'title must be 1 to 100 characters.');
        }
        deps.setTitle(title);
        return { type: 'OnSetSubWebViewTitle', success: true, data: {} };
    });

    // Cut to size rather than refused: a report is most wanted when the page is least able to fix it.
    host.registerHandler('ReportSubWebViewError', async message => {
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
    });

    return host;
};
