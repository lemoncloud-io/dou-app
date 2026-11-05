import type { SubWebViewCloseReason } from '@chatic/bridge-messages';

import type { ILogService } from '../log';
import { isAllowedSubWebViewUrl, SUB_WEBVIEW_DOMAINS } from './subWebViewAllowlist';
import { fitsSubWebViewData, isSubWebViewAppId, isSubWebViewParams } from './subWebViewData';
import type {
    ISubWebViewService,
    SubWebViewCloseResult,
    SubWebViewEntry,
    SubWebViewEvent,
    SubWebViewOpenResult,
} from './types';

let sequence = 0;
const defaultViewId = () => `sub-${Date.now().toString(36)}-${++sequence}`;

/**
 * The one place the main WebView's side and the sub WebView's side meet. The main side asks it to
 * open and close; the sub side reports the user closing; neither imports the other.
 */
export class SubWebViewService implements ISubWebViewService {
    private view: SubWebViewEntry | null = null;
    private readonly listeners = new Set<(event: SubWebViewEvent) => void>();

    constructor(
        private readonly logger: ILogService,
        private readonly domains: readonly string[] = SUB_WEBVIEW_DOMAINS,
        private readonly nextViewId: () => string = defaultViewId
    ) {}

    current(): SubWebViewEntry | null {
        return this.view;
    }

    open(request: { url: unknown; title?: unknown; params?: unknown; appId?: unknown }): SubWebViewOpenResult {
        const { url, title, params, appId } = request;
        if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return { ok: false, code: 'INVALID' };
        if (title !== undefined && typeof title !== 'string') return { ok: false, code: 'INVALID' };
        if (params !== undefined && !isSubWebViewParams(params)) return { ok: false, code: 'INVALID' };
        if (appId !== undefined && !isSubWebViewAppId(appId)) return { ok: false, code: 'INVALID' };
        if (!isAllowedSubWebViewUrl(url, this.domains)) {
            this.logger.warn('WEBVIEW', '[sub] open refused: origin not allowed', { url });
            return { ok: false, code: 'NOT_ALLOWED' };
        }
        if (this.view) return { ok: false, code: 'ALREADY_OPEN' };

        const view: SubWebViewEntry = {
            viewId: this.nextViewId(),
            url,
            ...(title ? { title } : {}),
            params: params ?? {},
            ...(appId ? { appId } : {}),
        };
        this.view = view;
        this.emit({ type: 'opened', view });
        return { ok: true, view };
    }

    close(viewId: unknown, reason: SubWebViewCloseReason, result?: unknown): SubWebViewCloseResult {
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
        // `host` is the closest reason, but nothing reads it: the event goes to the routing only.
        this.emit({ type: 'closed', viewId, reason: 'host', notifyHost: false });
    }

    subscribe(listener: (event: SubWebViewEvent) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private emit(event: SubWebViewEvent): void {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (e) {
                // One listener failing must not keep the other from hearing the close.
                this.logger.error('WEBVIEW', '[sub] listener threw', e);
            }
        }
    }
}
