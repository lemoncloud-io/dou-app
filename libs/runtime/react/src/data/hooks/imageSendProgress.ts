import { useCallback, useSyncExternalStore } from 'react';

type SlotRatios = readonly (number | undefined)[];

const progress = new Map<string, SlotRatios>();
const listeners = new Map<string, Set<() => void>>();

const STEPS = 100;

const notify = (pendingId: string) => listeners.get(pendingId)?.forEach(listener => listener());

export const setImageSendProgress = (
    pendingId: string,
    slot: number,
    sentBytes: number,
    totalBytes: number,
    slotCount: number
): void => {
    const ratio =
        totalBytes > 0 ? Math.floor(Math.min(Math.max(sentBytes / totalBytes, 0), 1) * STEPS) / STEPS : undefined;
    const current = progress.get(pendingId);
    if (current && current[slot] === ratio) return;
    const next: (number | undefined)[] = current ? [...current] : Array.from({ length: slotCount }, () => undefined);
    next[slot] = ratio;
    progress.set(pendingId, next);
    notify(pendingId);
};

export const clearImageSendProgress = (pendingId: string): void => {
    if (!progress.delete(pendingId)) return;
    notify(pendingId);
};

export const useImageSendProgress = (pendingId: string | undefined): SlotRatios | undefined => {
    const subscribe = useCallback(
        (listener: () => void) => {
            if (!pendingId) return () => undefined;
            const set = listeners.get(pendingId) ?? new Set();
            listeners.set(pendingId, set);
            set.add(listener);
            return () => {
                set.delete(listener);
                if (set.size === 0 && listeners.get(pendingId) === set) listeners.delete(pendingId);
            };
        },
        [pendingId]
    );
    const read = useCallback(() => (pendingId ? progress.get(pendingId) : undefined), [pendingId]);
    return useSyncExternalStore(subscribe, read, read);
};
