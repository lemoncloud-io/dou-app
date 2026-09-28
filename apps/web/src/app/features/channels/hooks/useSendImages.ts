import { useCallback, useEffect, useRef } from 'react';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { IMAGE_MESSAGE_SLOT_MAX, isPendingUploadSlot, sendImageMessage, type SendImagePorts } from '@chatic/data';
import { CHAT_ATTACHMENT, prepareImage } from '@chatic/shared';

import { useAppForeground } from '../../../bridge/useAppForeground';
import { getShellPut, syncShellTransfers } from '../../../bridge/shellUpload';

interface PendingImages {
    channelId: string;
    parentId?: string;
    files: File[];
    /** One object URL per file — the pending row's previews. Revoked when the entry goes. */
    urls: string[];
    inFlight: boolean;
    /** The screen that sent it has left; drop the entry as soon as its send settles. */
    detached: boolean;
}

/**
 * The picked files of every unsent image message, by pending row id — this page's memory and
 * nothing more. A `File` cannot be stored, so a row whose entry is not here (a reload, a left
 * screen) can never be retried; the pending row outlives it in the cache, and that is why the
 * attach-time sweep below exists.
 *
 * Module scope rather than hook state because it is per page, not per screen: a room and its thread
 * can be open together, and neither may mistake the other's rows for leftovers.
 */
const pendingImages = new Map<string, PendingImages>();

const release = (pendingId: string) => {
    const entry = pendingImages.get(pendingId);
    if (!entry) return;
    entry.urls.forEach(url => URL.revokeObjectURL(url));
    pendingImages.delete(pendingId);
};

const log = (message: string, data?: Record<string, unknown>) => logger.info('UPLOAD', message, data);

export interface UseSendImagesInput {
    channelId: string;
    /** Thread-reply target — the root's full id. Omit for a top-level message. */
    parentId?: string;
}

/**
 * Sends picked images as one message: writes the pending row at once, runs the upload sequence on
 * this shell's PUT, then swaps in the server's row — or marks the row failed and keeps the files so
 * the same pictures can be retried.
 *
 * Attaching to a channel also settles what an earlier page left behind: pending image rows with no
 * files in memory are marked failed (`canRetry` is false for them — delete is all that is left), and
 * transfers the native shell finished while the page was away are caught up.
 */
export const useSendImages = ({ channelId, parentId }: UseSendImagesInput) => {
    const { chat } = runtime.data.useRuntimeRepositories();
    const chatRef = useRef(chat);
    chatRef.current = chat;
    // Whether this screen is still attached. A send that finishes creating its row after the screen
    // left must not park its files in the page map, where no cleanup would ever reach them.
    const attachedRef = useRef(true);

    /** Runs the sequence for an entry already marked `inFlight` by its caller. */
    const run = useCallback(async (pendingId: string) => {
        const entry = pendingImages.get(pendingId);
        if (!entry) return;
        const repository = chatRef.current;
        const ports: SendImagePorts = {
            prepare: file => prepareImage(file, CHAT_ATTACHMENT),
            start: payload => repository.startUploads(payload),
            complete: payload => repository.completeUploads(payload),
            put: getShellPut(),
            send: ({ uploadIds }) => repository.sendPendingImageChat(pendingId, { uploadIds }),
        };

        const result = await sendImageMessage(entry.files, ports);
        if (result.status === 'sent') {
            release(pendingId);
            return;
        }
        await repository.failPendingImageChat(pendingId).catch(error => {
            log('image message: could not mark the row failed', { error: (error as Error)?.name });
        });
        // Only now: a retry let in before the failure was written would be overwritten by it.
        entry.inFlight = false;
        if (entry.detached) release(pendingId);
    }, []);

    const sendImages = useCallback(
        async (picked: File[]) => {
            // Cut before the row is written, so the row shows exactly the slots that will be sent.
            const files = picked.slice(0, IMAGE_MESSAGE_SLOT_MAX);
            if (files.length === 0) return;
            const urls = files.map(file => URL.createObjectURL(file));
            let pendingId: string;
            try {
                pendingId = await chatRef.current.createPendingImageChat({
                    channelId,
                    ...(parentId ? { parentId } : {}),
                    localThumbUrls: urls,
                });
            } catch (error) {
                urls.forEach(url => URL.revokeObjectURL(url));
                throw error;
            }
            pendingImages.set(pendingId, {
                channelId,
                parentId,
                files,
                urls,
                inFlight: true,
                detached: !attachedRef.current,
            });
            await run(pendingId);
        },
        [channelId, parentId, run]
    );

    /** Tries the same pictures again, on the same row. False when the files are gone or it is still sending. */
    const retry = useCallback(
        async (pendingId: string): Promise<boolean> => {
            const entry = pendingImages.get(pendingId);
            if (!entry || entry.inFlight) return false;
            // Claimed before the first await, so a second tap in the same moment finds it taken.
            entry.inFlight = true;
            try {
                await chatRef.current.createPendingImageChat({
                    channelId: entry.channelId,
                    ...(entry.parentId ? { parentId: entry.parentId } : {}),
                    localThumbUrls: entry.urls,
                    pendingId,
                });
            } catch {
                // The row is gone (deleted meanwhile): its files have nothing left to belong to.
                release(pendingId);
                return false;
            }
            await run(pendingId);
            return true;
        },
        [run]
    );

    const canRetry = useCallback((pendingId: string) => {
        const entry = pendingImages.get(pendingId);
        return !!entry && !entry.inFlight;
    }, []);

    /** Forgets a pending row's files. The row itself is removed by the existing failed-message delete. */
    const discard = useCallback((pendingId: string) => release(pendingId), []);

    useEffect(() => {
        let active = true;
        attachedRef.current = true;
        // Back on a screen whose send is still running: its files are wanted again.
        for (const entry of pendingImages.values()) {
            if (entry.channelId === channelId && entry.parentId === parentId) entry.detached = false;
        }
        // Only rows older than this screen can be leftovers. A row sent from here in the meantime is
        // written before it reaches the map, and the sweep must not catch it in between.
        const attachedAt = Date.now();
        void (async () => {
            await syncShellTransfers();
            let rows;
            try {
                rows = await chatRef.current.listPendingImageChats(channelId);
            } catch {
                return;
            }
            for (const row of rows) {
                if (!active) return;
                if (pendingImages.has(row.id) || row.createdAtMs >= attachedAt) continue;
                const stillSending =
                    row.isPending ||
                    row.upload$$?.some(slot => isPendingUploadSlot(slot) && slot.localStatus === 'sending');
                if (!stillSending) continue;
                await chatRef.current.failPendingImageChat(row.id).catch(() => undefined);
            }
        })();

        return () => {
            active = false;
            attachedRef.current = false;
            // Leaving the channel drops its files (they cannot follow the user anywhere else). A send
            // still running keeps its files until it settles, so it can still finish.
            for (const [pendingId, entry] of pendingImages) {
                // A room and its thread share the channel id; each screen drops only its own.
                if (entry.channelId !== channelId || entry.parentId !== parentId) continue;
                if (entry.inFlight) entry.detached = true;
                else release(pendingId);
            }
        };
    }, [channelId, parentId]);

    useAppForeground(() => {
        void syncShellTransfers();
    });

    return { sendImages, retry, canRetry, discard };
};
