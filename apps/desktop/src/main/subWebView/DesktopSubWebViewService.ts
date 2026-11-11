import type { SubWebViewCloseReason, SubWebViewErrorCode } from '@chatic/bridge-messages';
import type { IAppBridgeHost } from '@chatic/bridges';
import {
    fitsSubWebViewData,
    isSubWebViewAppId,
    isSubWebViewParams,
    subWebViewOriginOf,
    subWebViewTrustOf,
    type SubWebViewTrust,
} from '@chatic/shared/subWebViewTrust';

/** The sub WebView that is showing. */
export interface DesktopSubWebViewEntry {
    viewId: string;
    url: string;
    /** The origin the view was opened on: the only one it loads, and the only one it answers. */
    origin: string;
    trust: SubWebViewTrust;
    title?: string;
    /** What the web passed for the page; `{}` when it passed nothing. */
    params: Record<string, unknown>;
}

export type DesktopSubWebViewOpenResult =
    | { ok: true; view: DesktopSubWebViewEntry }
    | { ok: false; code: SubWebViewErrorCode };

export type DesktopSubWebViewCloseResult = { ok: true } | { ok: false; code: SubWebViewErrorCode };

/**
 * What the service reports: the window, which shows and removes the view, and the main window's
 * host, which tells the web. `notifyHost` is false only when the web reloaded under the view.
 */
export type DesktopSubWebViewEvent =
    | { type: 'opened'; view: DesktopSubWebViewEntry }
    | { type: 'closed'; viewId: string; reason: SubWebViewCloseReason; notifyHost: boolean; result?: unknown };

let sequence = 0;
const defaultViewId = () => `sub-${Date.now().toString(36)}-${++sequence}`;

/**
 * The one place the main window's side and the sub view's side meet, the same shape as the phone
 * shell's service: the main side asks it to open and close, the view reports the user and the page
 * closing it, and neither imports the other. Electron-free, so all of it runs under jest.
 *
 * What it opens is the shared trust rule's to say: any URL `subWebViewTrustOf` gives a tier. That is
 * wider than the phone shell, which opens the reviewed pages only — the web asks this shell for an
 * owner's own link, and learns it may from the handshake's `subWebViewOpenScope`.
 */
export class DesktopSubWebViewService {
    private view: DesktopSubWebViewEntry | null = null;
    private readonly listeners = new Set<(event: DesktopSubWebViewEvent) => void>();

    constructor(
        private readonly onListenerError: (error: unknown) => void = () => undefined,
        private readonly nextViewId: () => string = defaultViewId
    ) {}

    current(): DesktopSubWebViewEntry | null {
        return this.view;
    }

    /**
     * Validate a request from the web and record a new view. `appId` is checked and otherwise
     * ignored: it names a reviewed app for its share link, which this shell does not build.
     */
    open(request: { url: unknown; title?: unknown; params?: unknown; appId?: unknown }): DesktopSubWebViewOpenResult {
        const { url, title, params, appId } = request;
        if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return { ok: false, code: 'INVALID' };
        if (title !== undefined && typeof title !== 'string') return { ok: false, code: 'INVALID' };
        if (params !== undefined && !isSubWebViewParams(params)) return { ok: false, code: 'INVALID' };
        if (appId !== undefined && !isSubWebViewAppId(appId)) return { ok: false, code: 'INVALID' };
        const trust = subWebViewTrustOf(url);
        const origin = subWebViewOriginOf(url);
        if (!trust || !origin) return { ok: false, code: 'NOT_ALLOWED' };
        if (this.view) return { ok: false, code: 'ALREADY_OPEN' };

        const view: DesktopSubWebViewEntry = {
            viewId: this.nextViewId(),
            url,
            origin,
            trust,
            ...(title ? { title } : {}),
            params: params ?? {},
        };
        this.view = view;
        this.emit({ type: 'opened', view });
        return { ok: true, view };
    }

    /** Close the view named `viewId`; `NOT_OPEN` when it is not the one showing. */
    close(viewId: unknown, reason: SubWebViewCloseReason, result?: unknown): DesktopSubWebViewCloseResult {
        if (typeof viewId !== 'string' || !viewId) return { ok: false, code: 'INVALID' };
        if (!fitsSubWebViewData(result)) return { ok: false, code: 'INVALID' };
        if (this.view?.viewId !== viewId) return { ok: false, code: 'NOT_OPEN' };
        this.view = null;
        this.emit({ type: 'closed', viewId, reason, notifyHost: true, ...(result !== undefined ? { result } : {}) });
        return { ok: true };
    }

    /** The web that opened the view reloaded (or its window went away): remove it without telling the new page. */
    resetForNewHost(): void {
        if (!this.view) return;
        const { viewId } = this.view;
        this.view = null;
        this.emit({ type: 'closed', viewId, reason: 'host', notifyHost: false });
    }

    subscribe(listener: (event: DesktopSubWebViewEvent) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private emit(event: DesktopSubWebViewEvent): void {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (error) {
                // One listener failing must not keep the other from hearing the close.
                this.onListenerError(error);
            }
        }
    }
}

/**
 * Tells the web each time a view closes. A close marked `notifyHost: false` — the web reloaded under
 * the view — is not sent: the page that opened the view is gone.
 */
export const forwardSubWebViewClosed = (service: DesktopSubWebViewService, host: IAppBridgeHost): (() => void) =>
    service.subscribe(event => {
        if (event.type !== 'closed' || !event.notifyHost) return;
        host.pushEvent({
            type: 'OnSubWebViewClosed',
            success: true,
            data: {
                viewId: event.viewId,
                reason: event.reason,
                ...(event.result !== undefined ? { result: event.result } : {}),
            },
        });
    });
