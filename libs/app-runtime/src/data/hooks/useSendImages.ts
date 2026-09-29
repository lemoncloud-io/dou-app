import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { logger } from '@chatic/bridges';
import {
    IMAGE_MESSAGE_SLOT_MAX,
    isPendingUploadSlot,
    sendImageMessage,
    type PutPort,
    type SendImagePorts,
} from '@chatic/data';
import { CHAT_ATTACHMENT, prepareImage } from '@chatic/shared';

import { getCloudRepositories, runInCloud } from '../cloudChat';

interface PendingImages {
    /** The cloud the row was written in — where its upload and its send go, whatever is selected by then. */
    cid: string;
    channelId: string;
    parentId?: string;
    files: File[];
    /** One object URL per file — the pending row's previews. Revoked when the entry goes. */
    urls: string[];
    /** Whether `urls` already point at the thumbnails rather than the picked originals. */
    thumbnailed: boolean;
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

/**
 * Bumped on every change a screen renders from (an entry added, dropped, claimed or settled), so
 * `canRetry` is read again. Without it a row re-rendered by the failure write, which lands before
 * the entry stops being in flight, would keep its Retry hidden until something else re-rendered it.
 */
let version = 0;
const listeners = new Set<() => void>();
const changed = () => {
    version += 1;
    listeners.forEach(listener => listener());
};
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
};
const getVersion = () => version;

const release = (pendingId: string) => {
    const entry = pendingImages.get(pendingId);
    if (!entry) return;
    entry.urls.forEach(url => URL.revokeObjectURL(url));
    pendingImages.delete(pendingId);
    changed();
};

const log = (message: string, data?: Record<string, unknown>) => logger.info('UPLOAD', message, data);

/**
 * The chat repository of the room's own cloud, never the selection's: an upload takes seconds, and a
 * switch in that time would otherwise put the finished message on the next cloud's socket.
 */
const chatOf = (cid: string) => getCloudRepositories(cid).chat;

/**
 * Points a pending row's previews at the thumbnails the preparation just made.
 *
 * The row is written before anything is prepared, so it can only start from the picked originals —
 * a phone photo is several megapixels, and the feed would decode ten of them for tiles a few hundred
 * pixels wide. Once every image is prepared the row is rewritten ONCE, with a thumbnail preview for
 * each image that has one (a GIF is not re-encoded and keeps its original). It runs before the upload
 * starts, so it can never land after the row has been swapped for the server's.
 */
const switchToThumbnailPreviews = async (pendingId: string, thumbnails: (File | null)[]): Promise<void> => {
    const entry = pendingImages.get(pendingId);
    if (!entry || entry.thumbnailed || thumbnails.every(file => !file)) return;
    const next = entry.urls.map((url, i) => {
        const thumbnail = thumbnails[i];
        return thumbnail ? URL.createObjectURL(thumbnail) : url;
    });
    const revokeNew = () => next.forEach((url, i) => url !== entry.urls[i] && URL.revokeObjectURL(url));
    try {
        await chatOf(entry.cid).createPendingImageChat({
            channelId: entry.channelId,
            ...(entry.parentId ? { parentId: entry.parentId } : {}),
            localThumbUrls: next,
            pendingId,
        });
    } catch {
        // The row is gone (deleted meanwhile); keep what the entry had.
        revokeNew();
        return;
    }
    entry.urls.forEach((url, i) => url !== next[i] && URL.revokeObjectURL(url));
    entry.urls = next;
    entry.thumbnailed = true;
};

export interface UseSendImagesInput {
    /** The cloud of the room the pictures are sent from — the channel row's `cid`. */
    cid: string;
    channelId: string;
    /** Thread-reply target — the root's full id. Omit for a top-level message. */
    parentId?: string;
    /** How this shell moves the bytes: the page's own `xhrPut`, or the app's native transfer. */
    put: PutPort;
    /**
     * Runs before the attach-time sweep — a shell that finishes transfers while the page is away
     * catches up here, so a row it finished is not failed as a leftover.
     */
    beforeSweep?: () => Promise<void>;
}

/**
 * Sends picked images as one message: writes the pending row at once, runs the upload sequence on
 * this shell's PUT, then swaps in the server's row — or marks the row failed and keeps the files so
 * the same pictures can be retried.
 *
 * Attaching to a channel also settles what an earlier page left behind: pending image rows with no
 * files in memory are marked failed (`canRetry` is false for them — delete is all that is left),
 * after `beforeSweep` has let the shell catch up with transfers it finished while the page was away.
 *
 * Every screen of every shell runs this one hook; what differs between shells enters as `put` and
 * `beforeSweep`.
 */
export const useSendImages = ({ cid, channelId, parentId, put, beforeSweep }: UseSendImagesInput) => {
    // Whether this screen is still attached. A send that finishes creating its row after the screen
    // left must not park its files in the page map, where no cleanup would ever reach them.
    const attachedRef = useRef(true);
    // Read when a send starts, not captured by it: the ports may be rebuilt on any render.
    const putRef = useRef(put);
    putRef.current = put;
    const beforeSweepRef = useRef(beforeSweep);
    beforeSweepRef.current = beforeSweep;
    const currentVersion = useSyncExternalStore(subscribe, getVersion);

    /**
     * Runs the sequence for an entry already marked `inFlight` by its caller, holding its cloud's
     * socket from the first upload request to the send, so a switch meanwhile cannot tear it down.
     */
    const run = useCallback(async (pendingId: string) => {
        const entry = pendingImages.get(pendingId);
        if (!entry) return;
        const result = await runInCloud(entry.cid, ({ chat: repository }) => {
            // Collected as each image is prepared; when the last one is, the row switches to them.
            const thumbnails: (File | null)[] = [];
            const ports: SendImagePorts = {
                prepare: async file => {
                    const prepared = await prepareImage(file, CHAT_ATTACHMENT);
                    thumbnails.push(prepared.thumbnail?.file ?? null);
                    if (thumbnails.length === entry.files.length)
                        await switchToThumbnailPreviews(pendingId, thumbnails);
                    return prepared;
                },
                start: payload => repository.startUploads(payload),
                complete: payload => repository.completeUploads(payload),
                put: putRef.current,
                send: ({ uploadIds }) => repository.sendPendingImageChat(pendingId, { uploadIds }),
            };
            return sendImageMessage(entry.files, ports);
        });
        if (result.status === 'sent') {
            release(pendingId);
            return;
        }
        await chatOf(entry.cid)
            .failPendingImageChat(pendingId)
            .catch(error => {
                log('image message: could not mark the row failed', { error: (error as Error)?.name });
            });
        // Only now: a retry let in before the failure was written would be overwritten by it.
        entry.inFlight = false;
        changed();
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
                pendingId = await chatOf(cid).createPendingImageChat({
                    channelId,
                    ...(parentId ? { parentId } : {}),
                    localThumbUrls: urls,
                });
            } catch (error) {
                urls.forEach(url => URL.revokeObjectURL(url));
                throw error;
            }
            pendingImages.set(pendingId, {
                cid,
                channelId,
                parentId,
                files,
                urls,
                thumbnailed: false,
                inFlight: true,
                detached: !attachedRef.current,
            });
            changed();
            await run(pendingId);
        },
        [cid, channelId, parentId, run]
    );

    /** Tries the same pictures again, on the same row. False when the files are gone or it is still sending. */
    const retry = useCallback(
        async (pendingId: string): Promise<boolean> => {
            const entry = pendingImages.get(pendingId);
            if (!entry || entry.inFlight) return false;
            // Claimed before the first await, so a second tap in the same moment finds it taken.
            entry.inFlight = true;
            changed();
            try {
                await chatOf(entry.cid).createPendingImageChat({
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

    // A new function whenever the page's entries change, so a memoised row that takes it re-renders.
    const canRetry = useCallback(
        (pendingId: string) => {
            const entry = pendingImages.get(pendingId);
            return !!entry && !entry.inFlight;
        },
        [currentVersion]
    );

    /** Forgets a pending row's files. The row itself is removed by the existing failed-message delete. */
    const discard = useCallback((pendingId: string) => release(pendingId), []);

    useEffect(() => {
        let active = true;
        attachedRef.current = true;
        // Back on a screen whose send is still running: its files are wanted again.
        for (const entry of pendingImages.values()) {
            if (entry.cid === cid && entry.channelId === channelId && entry.parentId === parentId) {
                entry.detached = false;
            }
        }
        // Only rows older than this screen can be leftovers. A row sent from here in the meantime is
        // written before it reaches the map, and the sweep must not catch it in between.
        const attachedAt = Date.now();
        void (async () => {
            // A screen still waiting for its room (no channel row yet) has nothing it could sweep.
            if (!cid || !channelId) return;
            await beforeSweepRef.current?.();
            let rows;
            try {
                rows = await chatOf(cid).listPendingImageChats(channelId);
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
                await chatOf(cid)
                    .failPendingImageChat(row.id)
                    .catch(() => undefined);
            }
        })();

        return () => {
            active = false;
            attachedRef.current = false;
            // Leaving the channel drops its files (they cannot follow the user anywhere else). A send
            // still running keeps its files until it settles, so it can still finish.
            for (const [pendingId, entry] of pendingImages) {
                // A room and its thread share the channel id; each screen drops only its own.
                if (entry.cid !== cid || entry.channelId !== channelId || entry.parentId !== parentId) continue;
                if (entry.inFlight) entry.detached = true;
                else release(pendingId);
            }
        };
    }, [cid, channelId, parentId]);

    return { sendImages, retry, canRetry, discard };
};
