import { isPageHidden, pageHideCount, recordPerfSample } from '@chatic/perf';

import type { ImageLoadObserver } from '../../features/channels/hooks/useCachedImages';
import type { ImageRefreshObserver } from '../../features/channels/hooks/useImageAddressRefresh';

export const IMAGE_LOAD_SAMPLES_PER_MINUTE = 12;

export const IMAGE_LOAD_SAMPLES_PER_VARIANT_PER_MINUTE = 8;

export const IMAGE_REFRESH_SAMPLES_PER_MINUTE = 6;

export const IMAGE_SAMPLES_WHILE_HELD = 3;

const MINUTE_MS = 60_000;

interface ObserveImageLoadsOptions {
    setLoadObserver: (observer: ImageLoadObserver | undefined) => void;
    setRefreshObserver: (observer: ImageRefreshObserver | undefined) => void;
    record?: typeof recordPerfSample;
    now?: () => number;
    isHidden?: () => boolean;
    hideCount?: () => number;
    isHeld?: () => boolean;
}

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
