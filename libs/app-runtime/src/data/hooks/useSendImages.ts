import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { logger } from '@chatic/bridges';
import {
    type ChatAttachmentSource,
    chatAttachmentSourceFormat,
    type ChatUploadKind,
    IMAGE_MESSAGE_SLOT_MAX,
    isPendingUploadSlot,
    isShellFileRef,
    judgeChatAttachments,
    type PendingFileDetails,
    type PreparedImageMirror,
    type PutResult,
    sendImageMessage,
    type PutPort,
    type SendImagePorts,
    type SendImageResult,
    type ShellFilePutPort,
    type ShellFileRef,
    type UploadPutTarget,
} from '@chatic/data';
import { prepareChatAttachment } from '@chatic/shared';

import { getCloudRepositories, runInCloud } from '../cloudChat';

interface PendingImages {
    /** The cloud the row was written in — where its upload and its send go, whatever is selected by then. */
    cid: string;
    channelId: string;
    parentId?: string;
    files: ChatAttachmentSource[];
    /**
     * One preview per file — the pending row's. An object URL for a page image or document; empty for a
     * video and for a shell file, which have nothing the page could draw. Revoked when the entry goes.
     */
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
 * Shell files a retry cannot send: the shell has said they are gone (`SOURCE` — it cleared its folder,
 * or the OS cleared the cache), or a video was refused for what it is (`TOO_LARGE`, `UNSUPPORTED`, or
 * its conversion over the limit), which converting it again would only repeat. A row holding one is
 * offered delete, not a retry that can only fail again. A conversion that failed in passing (`SYSTEM`,
 * such as the app leaving the screen mid-way) stays retryable.
 */
const goneShellFiles = new Set<string>();
const isGone = (source: ChatAttachmentSource) => isShellFileRef(source) && goneShellFiles.has(source.uri);

/**
 * A shell video as `PrepareVideo` hands it back: the H.264 `mp4` to send, and its poster when one was
 * made. The poster goes up from the shell like the video; `preview` is its copy for the pending row,
 * since the page cannot read a shell address.
 */
export interface PreparedShellVideo {
    file: ShellFileRef;
    width: number;
    height: number;
    poster: { file: ShellFileRef; width: number; height: number; preview: Blob } | null;
}

/**
 * Converts a shell video (and makes its poster) in the shell. It rejects with the shell's `code` —
 * `TOO_LARGE`, `UNSUPPORTED`, `SOURCE` or `SYSTEM` — or a bridge one, a timeout included.
 */
export type PrepareVideoPort = (video: ShellFileRef) => Promise<PreparedShellVideo>;

/** Why a shell video was left out of its message before any upload: what the notice tells the user. */
export type VideoRefusal = 'too-large' | 'unsupported';

/**
 * A picked file as the server takes it: its format's type, and for a video or document a name ending
 * in its extension. An image let in by its extension arrives untyped (or `image/jpg`), and declared
 * as-is the server would refuse it. A file no format fits is left as it is, and so is a shell video
 * still to convert: the shell names its result when it converts it.
 */
const asSent = (source: ChatAttachmentSource): { file: ChatAttachmentSource; kind: ChatUploadKind | null } => {
    const format = chatAttachmentSourceFormat(source);
    if (!format) return { file: source, kind: null };
    if (format.name === source.name && format.type === source.type) return { file: source, kind: format.kind };
    if (isShellFileRef(source)) {
        return {
            file: source.needsExport ? source : { ...source, name: format.name, type: format.type },
            kind: format.kind,
        };
    }
    // Same bytes under the server's type and name; a `File` over a `File` does not copy them.
    return {
        file: new File([source], format.name, { type: format.type, lastModified: source.lastModified }),
        kind: format.kind,
    };
};

/**
 * What a video or document's card shows while it is sent. An image draws its preview instead. A shell
 * video still to convert is shown as the `mp4` it will be, at its source's size.
 */
const pendingFileDetails = (source: ChatAttachmentSource): PendingFileDetails | null => {
    const format = chatAttachmentSourceFormat(source);
    return format && format.kind !== 'image'
        ? { name: format.name, contentType: format.type, size: source.size }
        : null;
};

/**
 * The pending row's preview of a picked file. A page video gets none: drawn as an image it would only
 * break, and its tile draws the poster once there is one. A shell file has no address the page can read.
 */
const previewUrlOf = (source: ChatAttachmentSource): string =>
    isShellFileRef(source) || chatAttachmentSourceFormat(source)?.kind === 'video' ? '' : URL.createObjectURL(source);

const revoke = (url: string) => {
    if (url) URL.revokeObjectURL(url);
};

/**
 * An image is resized with a thumbnail beside it. A video or document has nothing to resize and no
 * thumbnail: it goes up as it is, with no dimensions. A shell file is never read here; a shell video
 * reaches this only when it could not be converted first, and then goes up as the shell holds it.
 */
const prepareAttachment = async (source: ChatAttachmentSource): Promise<PreparedImageMirror<ChatAttachmentSource>> => {
    const sent = asSent(source);
    return isShellFileRef(sent.file) || (sent.kind && sent.kind !== 'image')
        ? { original: { file: sent.file, width: 0, height: 0 }, thumbnail: null }
        : prepareChatAttachment(sent.file);
};

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code;

/**
 * The PUT the sequence runs on: the shell's own sender for a shell file, the shell's page-file sender
 * otherwise. A shell file only exists in an app with the transfer module, so a shell file with no
 * shell sender to take it fails its slot rather than reaching a page PUT that cannot read it.
 */
const putFor =
    (put: PutPort, putShellFile: ShellFilePutPort | undefined) =>
    async (target: UploadPutTarget, file: ChatAttachmentSource, label: string): Promise<PutResult> => {
        if (!isShellFileRef(file)) return put(target, file, label);
        if (!putShellFile) return { kind: 'no-response', reason: 'system' };
        const result = await putShellFile(target, file, label);
        if (result.kind === 'no-response' && result.reason === 'source') goneShellFiles.add(file.uri);
        return result;
    };

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
    entry.urls.forEach(revoke);
    entry.files.forEach(file => isShellFileRef(file) && goneShellFiles.delete(file.uri));
    pendingImages.delete(pendingId);
    changed();
};

const log = (message: string, data?: Record<string, unknown>) => logger.info('UPLOAD', message, data);

/**
 * Writes the files a sent message left out (the server refused one, its transfer failed, or the shell
 * could not convert a video) as a failed message of their own, right after it. Without it they would
 * vanish with the pending row the server's message replaced, and nothing would say they were never
 * sent. Retry and delete then work on them as on any failed message — unless the screen that sent them
 * has left, or the files can never be sent again (`retryable: false`), in which case the row stays to
 * say so and only delete is left.
 */
const keepUnsent = async (sent: PendingImages, files: ChatAttachmentSource[], retryable = true): Promise<void> => {
    const urls = files.map(previewUrlOf);
    const localFiles = files.map(pendingFileDetails);
    const chat = chatOf(sent.cid);
    try {
        const pendingId = await chat.createPendingImageChat({
            channelId: sent.channelId,
            ...(sent.parentId ? { parentId: sent.parentId } : {}),
            localThumbUrls: urls,
            ...(localFiles.some(Boolean) ? { localFiles } : {}),
        });
        await chat.failPendingImageChat(pendingId);
        if (sent.detached || !retryable) {
            urls.forEach(revoke);
            return;
        }
        pendingImages.set(pendingId, { ...sent, files, urls, thumbnailed: false, inFlight: false });
        changed();
    } catch (error) {
        urls.forEach(revoke);
        log('image message: could not keep the unsent files', { error: (error as Error)?.name });
    }
};

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
 * each image that has one (a GIF is not re-encoded and keeps its original), and the poster of each shell
 * video that has one. It runs before the upload starts, so it can never land after the row has been
 * swapped for the server's.
 */
const switchToThumbnailPreviews = async (pendingId: string, thumbnails: (Blob | null)[]): Promise<void> => {
    const entry = pendingImages.get(pendingId);
    if (!entry || entry.thumbnailed || thumbnails.every(file => !file)) return;
    const next = entry.urls.map((url, i) => {
        const thumbnail = thumbnails[i];
        return thumbnail ? URL.createObjectURL(thumbnail) : url;
    });
    const revokeNew = () => next.forEach((url, i) => url !== entry.urls[i] && revoke(url));
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
    entry.urls.forEach((url, i) => url !== next[i] && revoke(url));
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
    /** How it sends a file the shell keeps. Only an app with the transfer module has one. */
    putShellFile?: ShellFilePutPort;
    /** How it converts a shell video before it is sent. Only an app with the attachment picker has one. */
    prepareVideo?: PrepareVideoPort;
    /** Told when the shell refused to convert a video, which then fails as its own message. */
    onVideoRefused?: (reason: VideoRefusal) => void;
    /**
     * Runs before the attach-time sweep — a shell that finishes transfers while the page is away
     * catches up here, so a row it finished is not failed as a leftover.
     */
    beforeSweep?: () => Promise<void>;
    /**
     * Waits for `cid`'s socket before the sequence's first request — `true` once it is back, `false`
     * when it did not come back in time, never a rejection. A shell whose pickers send the page to the
     * background passes one (`waitForCloudSocket`): the pick is answered as the app comes back, while
     * the socket is still reconnecting. Without one the sequence starts at once, as before.
     */
    waitForConnection?: (cid: string) => Promise<boolean>;
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
export const useSendImages = ({
    cid,
    channelId,
    parentId,
    put,
    putShellFile,
    prepareVideo,
    onVideoRefused,
    beforeSweep,
    waitForConnection,
}: UseSendImagesInput) => {
    // Whether this screen is still attached. A send that finishes creating its row after the screen
    // left must not park its files in the page map, where no cleanup would ever reach them.
    const attachedRef = useRef(true);
    // Read when a send starts, not captured by it: the ports may be rebuilt on any render.
    const putRef = useRef(put);
    putRef.current = put;
    const putShellFileRef = useRef(putShellFile);
    putShellFileRef.current = putShellFile;
    const prepareVideoRef = useRef(prepareVideo);
    prepareVideoRef.current = prepareVideo;
    const onVideoRefusedRef = useRef(onVideoRefused);
    onVideoRefusedRef.current = onVideoRefused;
    const waitForConnectionRef = useRef(waitForConnection);
    waitForConnectionRef.current = waitForConnection;
    const beforeSweepRef = useRef(beforeSweep);
    beforeSweepRef.current = beforeSweep;
    const currentVersion = useSyncExternalStore(subscribe, getVersion);

    /**
     * Converts the entry's shell videos in the shell, one at a time and in pick order, before the
     * sequence starts. A video the shell refuses or loses fails alone — the sequence would fail the
     * whole message for a preparation that throws — and its slot is reported the way a failed upload
     * is. What the conversion made is judged again, since its size was only estimated beforehand.
     */
    const convertVideos = useCallback(async (entry: PendingImages) => {
        const converted = new Map<number, PreparedShellVideo>();
        const refused: number[] = [];
        const refuse = (index: number, reason?: VideoRefusal) => {
            refused.push(index);
            if (reason) onVideoRefusedRef.current?.(reason);
        };
        for (const [index, source] of entry.files.entries()) {
            // By the format, not the shell's `kind`: an `.mp4` picked as a document is a video too, and
            // gets the shell's H.264 check and a poster.
            if (!isShellFileRef(source) || chatAttachmentSourceFormat(source)?.kind !== 'video') continue;
            const convert = prepareVideoRef.current;
            if (!convert) {
                refuse(index);
                continue;
            }
            try {
                const video = await convert(source);
                const { rejected } = judgeChatAttachments([video.file], 1);
                if (rejected.length > 0) {
                    goneShellFiles.add(source.uri);
                    refuse(index, rejected[0].reason === 'too-large' ? 'too-large' : 'unsupported');
                    continue;
                }
                converted.set(index, video);
            } catch (error) {
                const code = codeOf(error);
                if (code === 'SOURCE' || code === 'TOO_LARGE' || code === 'UNSUPPORTED') goneShellFiles.add(source.uri);
                refuse(index, code === 'TOO_LARGE' ? 'too-large' : code === 'UNSUPPORTED' ? 'unsupported' : undefined);
                log('image message: video not converted', { slot: index, code });
            }
        }
        return { converted, refused };
    }, []);

    /**
     * Runs the sequence for an entry already marked `inFlight` by its caller, holding its cloud's
     * socket from the first upload request to the send, so a switch meanwhile cannot tear it down. The
     * shell's video conversion comes first and outside that hold: it can take minutes, and needs no socket.
     */
    const run = useCallback(
        async (pendingId: string) => {
            const entry = pendingImages.get(pendingId);
            if (!entry) return;
            const { converted, refused } = await convertVideos(entry);
            // Positions in the pick of what goes to the sequence, which numbers its slots by its own list.
            const sending = entry.files.map((_, index) => index).filter(index => !refused.includes(index));
            let result: SendImageResult = { status: 'failed', reason: 'no-stored-upload', failedSlots: refused.length };
            if (sending.length > 0) {
                result = await runInCloud(entry.cid, async ({ chat: repository }) => {
                    // Inside the hold, so the slot it waits on is kept: a pick answered as the app comes back to
                    // the front starts the send while the socket is still reconnecting.
                    const wait = waitForConnectionRef.current;
                    if (wait && !(await wait(entry.cid))) log('image message: socket not back in time');
                    // Collected as each file is prepared; when the last one is, the row switches to them.
                    const previews: (Blob | null)[] = entry.files.map(
                        (_, index) => converted.get(index)?.poster?.preview ?? null
                    );
                    let next = 0;
                    const ports: SendImagePorts<ChatAttachmentSource> = {
                        // The sequence prepares its list in order, one at a time, so `next` is the slot.
                        prepare: async source => {
                            const index = sending[next++];
                            const video = converted.get(index);
                            const prepared: PreparedImageMirror<ChatAttachmentSource> = video
                                ? {
                                      original: { file: video.file, width: video.width, height: video.height },
                                      thumbnail: video.poster
                                          ? {
                                                file: video.poster.file,
                                                width: video.poster.width,
                                                height: video.poster.height,
                                            }
                                          : null,
                                  }
                                : await prepareAttachment(source);
                            const thumbnail = prepared.thumbnail?.file;
                            if (!video && thumbnail && !isShellFileRef(thumbnail)) previews[index] = thumbnail;
                            if (next === sending.length) await switchToThumbnailPreviews(pendingId, previews);
                            return prepared;
                        },
                        start: payload => repository.startUploads(payload),
                        complete: payload => repository.completeUploads(payload),
                        put: putFor(putRef.current, putShellFileRef.current),
                        send: ({ uploadIds }) => repository.sendPendingImageChat(pendingId, { uploadIds }),
                    };
                    return sendImageMessage(
                        sending.map(index => entry.files[index]),
                        ports
                    );
                });
            }
            if (result.status === 'sent') {
                const left = [...refused, ...result.failedIndexes.map(slot => sending[slot])].sort((a, b) => a - b);
                const unsent = left.map(index => entry.files[index]).filter(Boolean);
                // Read before the release, which forgets what the shell lost along with the entry.
                const lost = unsent.filter(isGone);
                const again = unsent.filter(file => !isGone(file));
                release(pendingId);
                if (again.length > 0) await keepUnsent(entry, again);
                if (lost.length > 0) await keepUnsent(entry, lost, false);
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
            // Files the shell has lost cannot be sent again; with all of them gone, delete is what is left.
            if (entry.detached || entry.files.every(isGone)) release(pendingId);
        },
        [convertVideos]
    );

    const sendImages = useCallback(
        async (picked: ChatAttachmentSource[]) => {
            // Cut before the row is written, so the row shows exactly the slots that will be sent.
            const files = picked.slice(0, IMAGE_MESSAGE_SLOT_MAX);
            if (files.length === 0) return;
            const urls = files.map(previewUrlOf);
            // Left out when every file is an image, so an image send writes the row it always has.
            const localFiles = files.map(pendingFileDetails);
            let pendingId: string;
            try {
                pendingId = await chatOf(cid).createPendingImageChat({
                    channelId,
                    ...(parentId ? { parentId } : {}),
                    localThumbUrls: urls,
                    ...(localFiles.some(Boolean) ? { localFiles } : {}),
                });
            } catch (error) {
                urls.forEach(revoke);
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
            // The shell catches up on every attach; a screen still waiting for its room (no channel
            // row yet) then has nothing it could sweep.
            await beforeSweepRef.current?.();
            if (!cid || !channelId) return;
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
