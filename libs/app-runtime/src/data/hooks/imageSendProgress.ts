import { useCallback, useSyncExternalStore } from 'react';

/**
 * How far each slot of an unsent attachment message has gone, by pending row id: a ratio per slot in
 * pick order, `undefined` for a slot whose bytes have not started moving. Page memory only.
 *
 * Never the cache row: a 300MB video reports several times a second for minutes, and every cache
 * write re-reads and re-renders the whole feed. Nothing is lost by keeping it here — a reload ends
 * the upload anyway, and the row is then swept as failed.
 *
 * Per row, so a tick re-renders only the message it belongs to.
 */
type SlotRatios = readonly (number | undefined)[];

const progress = new Map<string, SlotRatios>();
const listeners = new Map<string, Set<() => void>>();

/** Steps a ratio is rounded to. Finer than a ring can draw, coarse enough that a tick that moves nothing is not a render. */
const STEPS = 100;

const notify = (pendingId: string) => listeners.get(pendingId)?.forEach(listener => listener());

/**
 * Records where one slot's bytes stand. `totalBytes` 0 (a file the shell could not size) leaves the
 * slot unknown, which draws the spinner rather than a ring stuck at nothing.
 */
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

/** Forgets a row's progress: its send settled, failed, or starts over. */
export const clearImageSendProgress = (pendingId: string): void => {
    if (!progress.delete(pendingId)) return;
    notify(pendingId);
};

/**
 * Where an unsent attachment message's slots stand, in pick order — the positions of its `upload$$`.
 * `undefined` when nothing of it is moving on this page (it is not pending, or it has not reached its
 * PUTs). A slot's own `undefined` means its bytes are not counted yet: draw it as plain "sending".
 */
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
