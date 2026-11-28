import type {
    SubWebViewDisplay,
    SubWebViewOrientation,
    SubWebViewPermission,
    SubWebViewRuntimePermission,
} from '@chatic/bridge-messages';
import { subWebViewDisplayOf } from '@chatic/mini-app-protocol';

import { originOf } from './origin';

export const SUB_WEBVIEW_MANIFEST_PATH = '/.well-known/chatic-app.json';

export const SUB_WEBVIEW_MANIFEST_TIMEOUT_MS = 3000;

export const SUB_WEBVIEW_MANIFEST_LIMIT = 16 * 1024;

export interface SubWebViewManifestLogger {
    warn(tag: string, message: string, data?: unknown): void;
}

export interface ResolvedSubWebViewManifest {
    name?: string;
    permissions: ReadonlySet<SubWebViewPermission>;
    runtimePermissions: ReadonlySet<SubWebViewRuntimePermission>;
    display: SubWebViewDisplay;
    orientation: SubWebViewOrientation;
}

export const DEFAULT_SUB_WEBVIEW_MANIFEST: ResolvedSubWebViewManifest = Object.freeze({
    permissions: new Set<SubWebViewPermission>(),
    runtimePermissions: new Set<SubWebViewRuntimePermission>(),
    display: 'clean',
    orientation: 'any',
});

const PERMISSIONS: readonly SubWebViewPermission[] = ['clipboard', 'share', 'openUrl', 'userKey'];
const RUNTIME_PERMISSIONS: readonly SubWebViewRuntimePermission[] = [
    'session',
    'cloud',
    'place',
    'channel',
    'chat',
    'user',
    'chatSend',
    'chatReact',
];
const ORIENTATIONS: readonly SubWebViewOrientation[] = ['any', 'portrait', 'landscape'];
const NAME_LIMIT = 100;

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
    values.includes(value as T) ? (value as T) : fallback;

export const parseSubWebViewManifest = (text: string): ResolvedSubWebViewManifest | null => {
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        return null;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const manifest = value as Record<string, unknown>;
    if (manifest.manifestVersion !== 1) return null;

    const name = typeof manifest.name === 'string' ? manifest.name.trim() : '';
    const declared: unknown[] = Array.isArray(manifest.permissions) ? manifest.permissions : [];
    const permissions = declared.filter((p): p is SubWebViewPermission => PERMISSIONS.includes(p as never));
    const runtimePermissions = declared.filter((p): p is SubWebViewRuntimePermission =>
        RUNTIME_PERMISSIONS.includes(p as never)
    );
    return {
        ...(name && name.length <= NAME_LIMIT ? { name } : {}),
        permissions: new Set(permissions),
        runtimePermissions: new Set(runtimePermissions),
        display: subWebViewDisplayOf(manifest.display) ?? 'clean',
        orientation: oneOf(ORIENTATIONS, manifest.orientation, 'any'),
    };
};

export type ManifestFetch = (
    url: string,
    init: { signal: AbortSignal }
) => Promise<{
    ok: boolean;
    status: number;
    url: string;
    text(): Promise<string>;
}>;

export interface SubWebViewManifestOutcome {
    manifest: ResolvedSubWebViewManifest;
    transient: boolean;
}

export const fetchSubWebViewManifest = async (
    origin: string,
    deps: { fetch: ManifestFetch; logger: SubWebViewManifestLogger; timeoutMs?: number }
): Promise<SubWebViewManifestOutcome> => {
    const fallback = (reason: string, transient: boolean, extra: Record<string, unknown> = {}) => {
        deps.logger.warn('WEBVIEW', `[sub] manifest not used: ${reason}`, { origin, ...extra });
        return { manifest: DEFAULT_SUB_WEBVIEW_MANIFEST, transient };
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
        const controller = new AbortController();
        timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, deps.timeoutMs ?? SUB_WEBVIEW_MANIFEST_TIMEOUT_MS);
        const response = await deps.fetch(`${origin}${SUB_WEBVIEW_MANIFEST_PATH}`, { signal: controller.signal });
        if (!response.ok) return fallback('not served', false, { status: response.status });
        if (response.url && originOf(response.url) !== origin) {
            return fallback('redirected off the origin', false, { url: response.url });
        }
        const text = await response.text();
        if (text.length > SUB_WEBVIEW_MANIFEST_LIMIT) return fallback('too large', false, { length: text.length });
        const manifest = parseSubWebViewManifest(text);
        return manifest ? { manifest, transient: false } : fallback('not a version-1 manifest', false);
    } catch (e) {
        return fallback(timedOut ? 'timed out' : 'fetch failed', true, { error: (e as Error)?.message });
    } finally {
        clearTimeout(timer);
    }
};

export interface SubWebViewManifestStore {
    get(origin: string): Promise<ResolvedSubWebViewManifest>;
}

export const createSubWebViewManifestStore = (deps: {
    fetch: ManifestFetch;
    logger: SubWebViewManifestLogger;
    timeoutMs?: number;
}): SubWebViewManifestStore => {
    const cached = new Map<string, ResolvedSubWebViewManifest>();
    const inFlight = new Map<string, Promise<ResolvedSubWebViewManifest>>();

    const load = (origin: string) => {
        const pending = inFlight.get(origin);
        if (pending) return pending;
        const next = fetchSubWebViewManifest(origin, deps)
            .then(({ manifest, transient }) => {
                if (!transient) {
                    cached.set(origin, manifest);
                    return manifest;
                }
                return cached.get(origin) ?? manifest;
            })
            .catch(() => cached.get(origin) ?? DEFAULT_SUB_WEBVIEW_MANIFEST)
            .finally(() => inFlight.delete(origin));
        inFlight.set(origin, next);
        return next;
    };

    return {
        get(origin) {
            const known = cached.get(origin);
            if (!known) return load(origin);
            void load(origin);
            return Promise.resolve(known);
        },
    };
};
