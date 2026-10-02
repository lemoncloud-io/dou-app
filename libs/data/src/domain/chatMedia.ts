import { isPendingUploadSlot } from '../uploads/types';

import { uploadSlotKind } from './chatAttachments';
import type { DomainChat } from './models';

/**
 * A message's uploads split the way a screen draws them: photos and videos as one list of media, which
 * the tiles and the media viewer page through, and documents as cards. The viewer is given media items
 * only, never a message — so a later list from another source (a channel's media, say) opens the same
 * viewer with no change to it.
 */

type UploadSlot = NonNullable<DomainChat['upload$$']>[number];

/** How an item stands: on the server and drawable, still being sent, failed to send, or unreadable. */
export type ChatUploadState = 'ready' | 'sending' | 'failed' | 'broken';

/** One thing the media viewer can show. It knows nothing of the message or channel it came from. */
export interface MediaItem {
    /** Stable per item — `<cid>/<uploadId>`, or a local key for a slot still on its way. */
    readonly key: string;
    readonly kind: 'image' | 'video';
    /** The original — the signed address, or a local preview while it is sent. Absent while it cannot be opened. */
    readonly src?: string;
    /** The thumbnail, or a video's poster. A video without one draws a plain panel. */
    readonly preview?: string;
    readonly name?: string;
    readonly size?: number;
    readonly state: ChatUploadState;
}

/** One document of a message, as its card draws it. */
export interface ChatFileSlot {
    /** Same shape as a media item's key. */
    readonly key: string;
    /** The server's upload id; absent on a slot still being sent, which nothing can download yet. */
    readonly uploadId?: string;
    /** Absent on an upload older than names; the card shows a generic label then. */
    readonly name?: string;
    readonly size?: number;
    readonly contentType?: string;
    /** The signed address to download it from. */
    readonly url?: string;
    readonly state: ChatUploadState;
}

/** Where each item sits in the message's `upload$$`, for a caller that has to read the slot again. */
export interface ChatMediaSplit {
    media: MediaItem[];
    files: ChatFileSlot[];
    /** `mediaSlots[i]` is the `upload$$` position of `media[i]`; likewise `fileSlots` for `files`. */
    mediaSlots: number[];
    fileSlots: number[];
}

const keyOf = (cid: string, slot: UploadSlot, index: number): string => {
    if (isPendingUploadSlot(slot)) return `local-${index}`;
    return slot.id ? `${cid}/${slot.id}` : `${cid}/upload-${index}`;
};

/**
 * A message's uploads as media and files, each in the order they were sent.
 *
 * A server slot that failed, carries an error, or came back with no address to open is `broken`: the
 * sender picked it, so it keeps its place and the count still says so. A slot still on its way draws from
 * what the page kept: an image from its local preview, a video from its poster once the shell made one.
 * Audio, which the server does not take, is dropped.
 */
export const chatMediaItems = (cid: string, slots: readonly UploadSlot[] | null | undefined): ChatMediaSplit => {
    const split: ChatMediaSplit = { media: [], files: [], mediaSlots: [], fileSlots: [] };
    (slots ?? []).forEach((slot, index) => {
        const kind = uploadSlotKind(slot);
        if (kind === 'audio') return;
        const key = keyOf(cid, slot, index);
        if (isPendingUploadSlot(slot)) {
            const local = slot.localThumbUrl || undefined;
            const details = {
                ...(slot.localName ? { name: slot.localName } : {}),
                ...(slot.localSize !== undefined ? { size: slot.localSize } : {}),
            };
            if (kind === 'file') {
                split.files.push({
                    key,
                    ...details,
                    ...(slot.localContentType ? { contentType: slot.localContentType } : {}),
                    state: slot.localStatus,
                });
                split.fileSlots.push(index);
                return;
            }
            // A pending image's preview is the picked file itself (or its thumbnail), so it opens too. A
            // pending video has nothing the page can play.
            split.media.push({
                key,
                kind,
                ...(kind === 'image' && local ? { src: local } : {}),
                ...(local ? { preview: local } : {}),
                ...details,
                state: slot.localStatus,
            });
            split.mediaSlots.push(index);
            return;
        }
        const broken = slot.status === 'failed' || !!slot.error;
        const details = {
            ...(slot.name ? { name: slot.name } : {}),
            ...(slot.contentSize !== undefined ? { size: slot.contentSize } : {}),
        };
        if (kind === 'file') {
            split.files.push({
                key,
                ...(slot.id ? { uploadId: slot.id } : {}),
                ...details,
                ...(slot.contentType ? { contentType: slot.contentType } : {}),
                ...(slot.orgUrl ? { url: slot.orgUrl } : {}),
                state: broken || !slot.orgUrl ? 'broken' : 'ready',
            });
            split.fileSlots.push(index);
            return;
        }
        // An image without a thumbnail draws its original in the tile; a video without a poster draws none.
        const src = slot.orgUrl ?? (kind === 'image' ? slot.thumbUrl : undefined);
        const preview = slot.thumbUrl ?? (kind === 'image' ? slot.orgUrl : undefined);
        split.media.push({
            key,
            kind,
            ...(src ? { src } : {}),
            ...(preview ? { preview } : {}),
            ...details,
            state: broken || !src ? 'broken' : 'ready',
        });
        split.mediaSlots.push(index);
    });
    return split;
};
