import { useCallback } from 'react';

import { runtime } from '@chatic/app-runtime';

// Page-level on purpose: the same message can be on screen twice (the room and its thread), and both
// must not re-read it for the same dead address.
const refreshed = new Set<string>();

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
 * The message is read from the cloud it belongs to, the same partition the row lives in.
 */
export const useImageAddressRefresh = () =>
    useCallback(async ({ cid, chatId, src }: { cid: string; chatId: string; src: string }): Promise<boolean> => {
        const key = `${chatId}|${src}`;
        if (!chatId || refreshed.has(key)) return false;
        refreshed.add(key);
        try {
            await runtime.data.getCloudRepositories(cid).chat.getChat({ id: chatId });
        } catch {
            // Offline or gone — the placeholder stays, and a later failure of a new address tries again.
        }
        return true;
    }, []);
