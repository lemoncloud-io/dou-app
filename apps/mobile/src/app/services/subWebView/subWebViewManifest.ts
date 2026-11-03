import type { SubWebViewDisplay, SubWebViewOrientation, SubWebViewPermission } from '@chatic/bridge-messages';

import type { ILogService } from '../log';
import { originOf } from '../../utils/url';

/** Where a page serves its manifest, on its own origin. */
export const SUB_WEBVIEW_MANIFEST_PATH = '/.well-known/chatic-app.json';

/** How long the view waits for a manifest it has not seen before, before it opens the page without. */
export const SUB_WEBVIEW_MANIFEST_TIMEOUT_MS = 3000;

/** The longest manifest read, as a string; a manifest needs a few hundred characters. */
export const SUB_WEBVIEW_MANIFEST_LIMIT = 16 * 1024;

/** A manifest as the shell applies it: every field present, defaulted where the page left it out. */
export interface ResolvedSubWebViewManifest {
    name?: string;
    permissions: ReadonlySet<SubWebViewPermission>;
    display: SubWebViewDisplay;
    orientation: SubWebViewOrientation;
}

/** What a page gets with no manifest, or one the shell cannot read: the base set, the bar, any way up. */
export const DEFAULT_SUB_WEBVIEW_MANIFEST: ResolvedSubWebViewManifest = Object.freeze({
    permissions: new Set<SubWebViewPermission>(),
    display: 'standard',
    orientation: 'any',
});

const PERMISSIONS: readonly SubWebViewPermission[] = ['clipboard', 'share', 'openUrl', 'userKey'];
const DISPLAYS: readonly SubWebViewDisplay[] = ['standard', 'fullscreen'];
const ORIENTATIONS: readonly SubWebViewOrientation[] = ['any', 'portrait', 'landscape'];
const NAME_LIMIT = 100;

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
    values.includes(value as T) ? (value as T) : fallback;

/**
 * Reads a manifest's text. Lenient field by field — an unknown field, an unknown permission and a
 * wrong value are each dropped and the rest kept — but strict about what it is: anything that is not
 * a version-1 manifest is no manifest at all, since a later version may mean its fields differently.
 */
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
    const permissions = Array.isArray(manifest.permissions)
        ? manifest.permissions.filter((p): p is SubWebViewPermission => PERMISSIONS.includes(p))
        : [];
    return {
        ...(name && name.length <= NAME_LIMIT ? { name } : {}),
        permissions: new Set(permissions),
        display: oneOf(DISPLAYS, manifest.display, 'standard'),
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

/**
 * What a fetch found. `transient` is a failure that says nothing about the manifest itself — the
 * timeout, no network — as opposed to the origin's own answer (no file, a redirect elsewhere, a body
 * that is not a version-1 manifest), which is as authoritative as a manifest that reads.
 */
export interface SubWebViewManifestOutcome {
    manifest: ResolvedSubWebViewManifest;
    transient: boolean;
}

/**
 * Fetches `origin`'s manifest. Anything short of a readable one from that same origin — a missing
 * file, a redirect elsewhere, an oversized or broken body, the timeout — is reported and answered with
 * the default, so a page is never kept from opening by its manifest. A redirect is checked only when
 * the response names its URL, which React Native's networking does on both platforms.
 */
export const fetchSubWebViewManifest = async (
    origin: string,
    deps: { fetch: ManifestFetch; logger: Pick<ILogService, 'warn'>; timeoutMs?: number }
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
        // A redirect may only stay on the page's own origin: the manifest speaks for that origin alone.
        if (response.url && originOf(response.url) !== origin) {
            return fallback('redirected off the origin', false, { url: response.url });
        }
        // Read whole, then measured: the body arrives within the timeout either way.
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
    /**
     * The manifest to open `origin` with. One fetched earlier in this run answers at once and is
     * refreshed behind it, for the next open; otherwise this waits for the fetch.
     */
    get(origin: string): Promise<ResolvedSubWebViewManifest>;
}

/**
 * Manifests by origin, for this run of the app. A page's first open waits for its manifest; later ones
 * open with the last one read while a fresh copy is fetched, so a deploy that changes a manifest takes
 * effect one open later. Kept in memory only: a manifest is a few hundred characters from a CDN, and a
 * persisted copy would outlive a withdrawn permission across launches.
 *
 * A transient failure never replaces what was read: a page opened once offline must not lose its
 * permissions for the rest of the run. With nothing read yet it opens with the default, uncached, so
 * the next open tries again.
 */
export const createSubWebViewManifestStore = (deps: {
    fetch: ManifestFetch;
    logger: Pick<ILogService, 'warn'>;
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
            // Not expected — the fetch answers every failure itself — but a rejection must not stay in
            // `inFlight` and fail every later open of the origin.
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
