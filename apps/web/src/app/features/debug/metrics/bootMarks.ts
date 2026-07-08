/**
 * Boot timeline instrumentation. All values are milliseconds relative to
 * `performance.timeOrigin` (= navigation start), so the network/HTML phase
 * (navigation timing) and app phases (marks) share a single axis.
 *
 * This is the web half of the boot metrics plan — the same snapshot will later
 * be sent to the native shell (BootMetrics bridge message) and persisted there.
 */

export type BootMarkKey = 'main-start' | 'app-render' | 'session-initialized';

export interface BootAssetInfo {
    name: string;
    transferSize: number;
    decodedBodySize: number;
    durationMs: number;
    fromCache: boolean;
}

export interface BootNavigationInfo {
    ttfbMs: number;
    responseEndMs: number;
    domContentLoadedMs: number;
    loadEndMs: number;
}

export interface BootSnapshot {
    marks: Partial<Record<BootMarkKey, number>>;
    navigation: BootNavigationInfo | null;
    assets: BootAssetInfo[];
}

const marks: Partial<Record<BootMarkKey, number>> = {};

/** Record a boot milestone once; later calls for the same key are ignored. */
export const markBoot = (key: BootMarkKey): void => {
    if (marks[key] == null) marks[key] = Math.round(performance.now());
};

/**
 * Cache-hit heuristic: a served-from-cache resource reports transferSize 0 while
 * still having a decoded body. Some WebViews zero transferSize for cross-origin
 * entries too, so a fast duration (<30ms) is accepted as corroboration.
 */
export const isFromCache = (entry: Pick<BootAssetInfo, 'transferSize' | 'decodedBodySize' | 'durationMs'>): boolean =>
    entry.transferSize === 0 && (entry.decodedBodySize > 0 || entry.durationMs < 30);

/** Core app assets only (hashed /assets/ bundles) — the boot-critical downloads. */
export const summarizeAssets = (
    entries: Array<{ name: string; transferSize?: number; decodedBodySize?: number; duration: number }>
): BootAssetInfo[] =>
    entries
        .filter(entry => entry.name.includes('/assets/'))
        .map(entry => {
            const info = {
                name: entry.name.split('/').pop() ?? entry.name,
                transferSize: entry.transferSize ?? 0,
                decodedBodySize: entry.decodedBodySize ?? 0,
                durationMs: Math.round(entry.duration),
            };
            return { ...info, fromCache: isFromCache(info) };
        });

// getEntriesByType is missing in some environments (jsdom, very old engines).
const getEntries = <T>(type: string): T[] =>
    typeof performance.getEntriesByType === 'function' ? (performance.getEntriesByType(type) as T[]) : [];

const collectNavigation = (): BootNavigationInfo | null => {
    const [nav] = getEntries<PerformanceNavigationTiming>('navigation');
    if (!nav) return null;
    return {
        ttfbMs: Math.round(nav.responseStart),
        responseEndMs: Math.round(nav.responseEnd),
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
        loadEndMs: Math.round(nav.loadEventEnd),
    };
};

export const getBootSnapshot = (): BootSnapshot => ({
    marks: { ...marks },
    navigation: collectNavigation(),
    assets: summarizeAssets(getEntries<PerformanceResourceTiming>('resource')),
});
