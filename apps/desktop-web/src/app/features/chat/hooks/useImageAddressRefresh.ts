import { useCallback } from 'react';

import { runtime } from '@chatic/app-runtime';
import { RELAY_CLOUD_ID, type DomainChat } from '@chatic/data';

import { toChatFiles, toChatImages } from '../utils';

// Page-level on purpose: the same message can be on screen twice (the feed and its thread), and both
// must not re-read it for the same dead address.
const refreshed = new Set<string>();

/** Test seam — forgets which addresses were already refreshed. */
export const resetImageAddressRefresh = (): void => refreshed.clear();

/** The message, read from the cloud the reader is in now — the message's own, as for "Copy link". */
const readMessage = (chatId: string): Promise<DomainChat> => {
    const { cloud } = runtime.session.getGlobalSessionContext();
    return runtime.data.getCloudRepositories(cloud.cloudId || RELAY_CLOUD_ID).chat.getChat({ id: chatId });
};

/**
 * Re-reads a message whose image, video or document failed to load, so its signed addresses are fresh.
 *
 * The addresses in `upload$$` are signed when the message is read and expire a couple of hours later,
 * and a cached message keeps the old ones: a message from yesterday shows files that no longer load.
 * Reading the message again writes the new addresses to the cache, and the feed redraws from there.
 *
 * Once per dead address: if the fresh address fails too, the file stays a placeholder rather than
 * asking again in a loop. A later expiry is a different address, so it gets its own re-read.
 */
export const useImageAddressRefresh = () =>
    useCallback(async (chatId: string | undefined, src: string): Promise<void> => {
        const key = `${chatId}|${src}`;
        if (!chatId || refreshed.has(key)) return;
        refreshed.add(key);
        try {
            await readMessage(chatId);
        } catch {
            // Offline or gone — the placeholder stays, and a later failure of a new address tries again.
        }
    }, []);

/**
 * The fresh address of one file of a message, for something that holds an address and cannot wait for
 * the feed to redraw — a save, a copy, a forward that just failed on the old one. Reads the message
 * again every time it is asked: it is asked once, by an action the reader took that already failed.
 * `undefined` when the message cannot be read or the file is no longer in it.
 */
export const useFreshAddress = () =>
    useCallback(async (chatId: string | undefined, fileId: string): Promise<string | undefined> => {
        if (!chatId) return undefined;
        try {
            const { upload$$ } = await readMessage(chatId);
            const files = [...toChatImages(chatId, upload$$), ...toChatFiles(chatId, upload$$)];
            return files.find(file => file.id === fileId)?.url || undefined;
        } catch {
            return undefined;
        }
    }, []);

/**
 * Runs `run` on a file's address, and once more on a fresh one when it fails and there is one. The
 * original error stands when there is no other address, so an offline failure reads as it did.
 */
export const useRunWithFreshAddress = () => {
    const freshAddress = useFreshAddress();
    return useCallback(
        async <T>(
            file: { chatId: string | undefined; id: string; url: string },
            run: (url: string) => Promise<T>
        ): Promise<T> => {
            try {
                return await run(file.url);
            } catch (error) {
                const fresh = await freshAddress(file.chatId, file.id);
                if (!fresh || fresh === file.url) throw error;
                return run(fresh);
            }
        },
        [freshAddress]
    );
};
