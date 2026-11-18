import { useCallback } from 'react';

import { runtime } from '@chatic/app-runtime';
import { RELAY_CLOUD_ID } from '@chatic/data';

// Page-level on purpose: the same message can be on screen twice (the feed and its thread), and both
// must not re-read it for the same dead address.
const refreshed = new Set<string>();

/** Test seam — forgets which addresses were already refreshed. */
export const resetImageAddressRefresh = (): void => refreshed.clear();

/**
 * Re-reads a message whose image failed to load, so its signed addresses are fresh.
 *
 * The addresses in `upload$$` are signed when the message is read and expire a couple of hours later,
 * and a cached row keeps the old ones: a message from yesterday shows images that no longer load.
 * Reading the message again writes the new addresses to the cache, and the feed redraws from there.
 *
 * Once per dead address: if the fresh address fails too, the tile stays a placeholder rather than
 * asking again in a loop. A later expiry is a different address, so it gets its own re-read.
 */
export const useImageAddressRefresh = () =>
    useCallback(async (chatId: string | undefined, src: string): Promise<void> => {
        const key = `${chatId}|${src}`;
        if (!chatId || refreshed.has(key)) return;
        refreshed.add(key);
        try {
            // Read on the failure: the cloud the reader is in now is the message's, as for "Copy link".
            const { cloud } = runtime.session.getGlobalSessionContext();
            await runtime.data.getCloudRepositories(cloud.cloudId || RELAY_CLOUD_ID).chat.getChat({ id: chatId });
        } catch {
            // Offline or gone — the placeholder stays, and a later failure of a new address tries again.
        }
    }, []);
