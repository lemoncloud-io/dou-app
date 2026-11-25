import type { SubWebViewCloseReason, SubWebViewErrorCode } from '@chatic/bridge-messages';
import type { IAppBridgeHost } from '@chatic/bridges';
// eslint-disable-next-line @nx/enforce-module-boundaries -- shared is web-only; the sub-webview trust rules move to a platform-free mini-app protocol package
import {
    fitsSubWebViewData,
    isSubWebViewAppId,
    isSubWebViewParams,
    subWebViewOriginOf,
    subWebViewTrustOf,
    type SubWebViewTrust,
} from '@chatic/shared/subWebViewTrust';

export interface DesktopSubWebViewEntry {
    viewId: string;
    url: string;
    origin: string;
    trust: SubWebViewTrust;
    title?: string;
    params: Record<string, unknown>;
}

export type DesktopSubWebViewOpenResult =
    | { ok: true; view: DesktopSubWebViewEntry }
    | { ok: false; code: SubWebViewErrorCode };

export type DesktopSubWebViewCloseResult = { ok: true } | { ok: false; code: SubWebViewErrorCode };

export type DesktopSubWebViewEvent =
    | { type: 'opened'; view: DesktopSubWebViewEntry }
    | { type: 'closed'; viewId: string; reason: SubWebViewCloseReason; notifyHost: boolean; result?: unknown };

let sequence = 0;
const defaultViewId = () => `sub-${Date.now().toString(36)}-${++sequence}`;

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

    close(viewId: unknown, reason: SubWebViewCloseReason, result?: unknown): DesktopSubWebViewCloseResult {
        if (typeof viewId !== 'string' || !viewId) return { ok: false, code: 'INVALID' };
        if (!fitsSubWebViewData(result)) return { ok: false, code: 'INVALID' };
        if (this.view?.viewId !== viewId) return { ok: false, code: 'NOT_OPEN' };
        this.view = null;
        this.emit({ type: 'closed', viewId, reason, notifyHost: true, ...(result !== undefined ? { result } : {}) });
        return { ok: true };
    }

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
                this.onListenerError(error);
            }
        }
    }
}

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
