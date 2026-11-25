import type { SubWebViewCloseReason, SubWebViewErrorCode } from '@chatic/bridge-messages';
// eslint-disable-next-line @nx/enforce-module-boundaries -- shared is web-only; the sub-webview trust rules move to a platform-free mini-app protocol package
import type { SubWebViewTrust } from '@chatic/shared/subWebViewTrust';

export interface SubWebViewEntry {
    viewId: string;
    url: string;
    title?: string;
    params: Record<string, unknown>;
    appId?: string;
    trust: SubWebViewTrust;
}

export type SubWebViewOpenResult = { ok: true; view: SubWebViewEntry } | { ok: false; code: SubWebViewErrorCode };

export type SubWebViewCloseResult = { ok: true } | { ok: false; code: SubWebViewErrorCode };

export type SubWebViewEvent =
    | { type: 'opened'; view: SubWebViewEntry }
    | { type: 'closed'; viewId: string; reason: SubWebViewCloseReason; notifyHost: boolean; result?: unknown };

export interface ISubWebViewService {
    current(): SubWebViewEntry | null;
    open(request: { url: unknown; title?: unknown; params?: unknown; appId?: unknown }): SubWebViewOpenResult;
    close(viewId: unknown, reason: SubWebViewCloseReason, result?: unknown): SubWebViewCloseResult;
    resetForNewHost(): void;
    subscribe(listener: (event: SubWebViewEvent) => void): () => void;
}
