import { isPageHidden, pageHideCount, recordPerfSample } from '@chatic/perf';

import type { ImageLoadObserver } from '../../features/channels/hooks/useCachedImages';
import type { ImageRefreshObserver } from '../../features/channels/hooks/useImageAddressRefresh';

/**
 * At most this many `image_load` samples per minute. A room drawn from scratch asks for a dozen or more
 * thumbnails at once, and every one is the same kind of event; the first dozen of a minute say as much
 * about the store and the bucket as all of them would, and the pipeline's statistics share is not spent
 * on the rest. `api_request` keeps ten a minute for the same reason.
 */
export const IMAGE_LOAD_SAMPLES_PER_MINUTE = 12;

/**
 * At most this many of a minute's samples for one variant, so a room's burst of thumbnails cannot spend
 * the minute an opened photo's original would be kept in.
 */
export const IMAGE_LOAD_SAMPLES_PER_VARIANT_PER_MINUTE = 8;

/** At most this many `image_refresh` samples per minute — a re-read is rare unless addresses expired in bulk. */
export const IMAGE_REFRESH_SAMPLES_PER_MINUTE = 6;

/** At most this many samples of the two traces together while traces are still held for the WebAppReady report. */
export const IMAGE_SAMPLES_WHILE_HELD = 3;

const MINUTE_MS = 60_000;

interface ObserveImageLoadsOptions {
    /** `setImageLoadObserver` from the channels feature; overridable for tests. */
    setLoadObserver: (observer: ImageLoadObserver | undefined) => void;
    /** `setImageRefreshObserver` from the channels feature. */
    setRefreshObserver: (observer: ImageRefreshObserver | undefined) => void;
    /** Overridable for tests; production records through the process-wide perf slot. */
    record?: typeof recordPerfSample;
    now?: () => number;
    isHidden?: () => boolean;
    /** How many times the page has been hidden so far (`pageHideCount`); a change between begin and end drops the sample. */
    hideCount?: () => number;
    /** Whether traces are still held for the WebAppReady report (`configureWebPerfTraces().isHeld`). */
    isHeld?: () => boolean;
}

/** A fixed one-minute window with a total cap and an optional cap per group. */
const minuteWindow = (now: () => number, perMinute: number, perGroup = perMinute) => {
    let start = Number.NEGATIVE_INFINITY;
    let total = 0;
    let byGroup = new Map<string, number>();
    return (group: string): boolean => {
        const at = now();
        if (at - start >= MINUTE_MS) {
            start = at;
            total = 0;
            byGroup = new Map();
        }
        const ofGroup = byGroup.get(group) ?? 0;
        if (total >= perMinute || ofGroup >= perGroup) return false;
        total += 1;
        byGroup.set(group, ofGroup + 1);
        return true;
    };
};

/**
 * Records how chat images reach the screen, on the log pipeline only (Firebase never receives these):
 *
 * - `image_load` — one image the page's cache did not have in memory: `source` (`store`, `network`, or
 *   `address` when nothing was kept and the tile draws its signed address), `store` (what the store
 *   answered, `timeout` included), `fallback` (why the address is drawn) and `variant`, with
 *   `value_ms`, `store_ms`, `fetch_ms` and `bytes_kb`. It is what tells a slow store apart from a slow
 *   bucket and from a cache that keeps nothing.
 * - `image_refresh` — one message read again because an image's address stopped loading, almost always
 *   an expired signature: `kind` (`image`, or a `file` whose download found it expired), `outcome` and
 *   `value_ms`. The image waits for this read before it can load.
 *
 * Which runs record them is the telemetry policy's decision, like every pipeline-only trace. A load or
 * re-read the page was hidden at any point during is not recorded — the count of hides is noted when it
 * begins and compared when it ends — because its time is then the page's suspension, not the image's.
 *
 * @returns Stops observing.
 */
export const observeImageLoads = ({
    setLoadObserver,
    setRefreshObserver,
    record = recordPerfSample,
    now = Date.now,
    isHidden = isPageHidden,
    isHeld = () => false,
    hideCount = pageHideCount,
}: ObserveImageLoadsOptions): (() => void) => {
    const loadWindow = minuteWindow(now, IMAGE_LOAD_SAMPLES_PER_MINUTE, IMAGE_LOAD_SAMPLES_PER_VARIANT_PER_MINUTE);
    const refreshWindow = minuteWindow(now, IMAGE_REFRESH_SAMPLES_PER_MINUTE);
    let recordedWhileHeld = 0;

    const admit = (window: (group: string) => boolean, group: string, hidesAtBegin: number): boolean => {
        if (isHidden() || hideCount() !== hidesAtBegin) return false;
        const held = isHeld();
        if (held && recordedWhileHeld >= IMAGE_SAMPLES_WHILE_HELD) return false;
        if (!window(group)) return false;
        if (held) recordedWhileHeld += 1;
        return true;
    };

    setLoadObserver(() => {
        const hidesAtBegin = hideCount();
        return report => {
            if (!admit(loadWindow, report.variant, hidesAtBegin)) return;
            const metrics: Record<string, number> = {
                value_ms: Math.round(report.totalMs),
                store_ms: Math.round(report.storeMs),
            };
            if (report.fetchMs !== undefined) metrics.fetch_ms = Math.round(report.fetchMs);
            if (report.bytes !== undefined) metrics.bytes_kb = Math.round(report.bytes / 1024);
            record('image_load', {
                attributes: {
                    variant: report.variant,
                    source: report.source,
                    store: report.store,
                    ...(report.fallback ? { fallback: report.fallback } : {}),
                },
                metrics,
            });
        };
    });

    setRefreshObserver(() => {
        const hidesAtBegin = hideCount();
        return report => {
            if (!admit(refreshWindow, 'refresh', hidesAtBegin)) return;
            record('image_refresh', {
                attributes: { kind: report.kind, outcome: report.outcome },
                metrics: { value_ms: Math.round(report.ms) },
            });
        };
    });

    return () => {
        setLoadObserver(undefined);
        setRefreshObserver(undefined);
    };
};
