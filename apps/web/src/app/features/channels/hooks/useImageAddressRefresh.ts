import { useCallback } from 'react';

import { perfNow } from '@chatic/perf';
import { runtime } from '@chatic/runtime';

/**
 * One re-read, for the `image_refresh` measurement: what failed to load (`image`, or a `file` the
 * download found expired), whether the message could be read, and how long it took.
 */
export interface ImageRefreshReport {
    kind: 'image' | 'file';
    outcome: 'ok' | 'failed';
    ms: number;
}

/** Called when a re-read starts; the function it returns is told how it ended. */
export type ImageRefreshObserver = () => ((report: ImageRefreshReport) => void) | undefined;

// Page-level on purpose: the same message can be on screen twice (the room and its thread), and both
// must not re-read it for the same dead address.
const refreshed = new Set<string>();

let refreshObserver: ImageRefreshObserver | undefined;

/** Hands every re-read to `observer` — connected by `main.tsx`, like the image cache's load observer. */
export const setImageRefreshObserver = (observer: ImageRefreshObserver | undefined): void => {
    refreshObserver = observer;
};

// A measurement must never change what the re-read answers: what the observer throws is swallowed.
const beginRefreshReport = (): ((report: ImageRefreshReport) => void) | undefined => {
    try {
        return refreshObserver?.();
    } catch {
        return undefined;
    }
};

/** Test seam — forgets which addresses were already refreshed. */
export const resetImageAddressRefresh = (): void => refreshed.clear();

/**
 * Re-reads a message whose image failed to load, so its signed addresses are fresh.
 *
 * The addresses in `upload$$` are signed when the message is read and expire a couple of hours later,
 * and a cached row keeps the old ones: a room opened from the cache, or left open long enough, shows
 * images that no longer load. Reading the message again writes the new addresses to the cache, and the
 * feed redraws from there.
 *
 * Once per dead address: if the fresh address fails too, the image stays a placeholder rather than
 * asking again in a loop. A later expiry is a different address, so it gets its own re-read.
 * The message is read from the cloud it belongs to, the same partition the row lives in. `kind` only
 * labels the measurement: a file download that found its address expired re-reads through here too.
 */
export const useImageAddressRefresh = () =>
    useCallback(
        async ({
            cid,
            chatId,
            src,
            kind = 'image',
        }: {
            cid: string;
            chatId: string;
            src: string;
            kind?: ImageRefreshReport['kind'];
        }): Promise<boolean> => {
            const key = `${chatId}|${src}`;
            if (!chatId || refreshed.has(key)) return false;
            refreshed.add(key);
            const ended = beginRefreshReport();
            const startedAt = perfNow();
            let outcome: ImageRefreshReport['outcome'] = 'ok';
            try {
                await runtime.data.getCloudRepositories(cid).chat.getChat({ id: chatId });
            } catch {
                // Offline or gone — the placeholder stays, and a later failure of a new address tries again.
                outcome = 'failed';
            }
            try {
                ended?.({ kind, outcome, ms: perfNow() - startedAt });
            } catch {
                // Ignored, as above.
            }
            return true;
        },
        []
    );
