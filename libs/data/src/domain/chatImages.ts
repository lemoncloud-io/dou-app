import { isShellFileRef, type ChatAttachmentSource } from '../uploads/types';

import {
    CHAT_ATTACHMENT_MAX_BYTES,
    chatAttachmentFormat,
    type ChatAttachmentFilter,
    type ChatAttachmentFormat,
    type ChatUploadKind,
    uploadSlotKind,
} from './chatAttachments';
import type { DomainChat } from './models';

/**
 * Image-message rules the screens share: which files may be picked, how many images a chat
 * carries, and what kind of attachment a preview should name. The send sequence itself lives in
 * `uploads/`; this is the part a picker and a list row both need before or without it.
 */

/** The formats the server accepts. Anything else is refused before an upload is started. */
export const CHAT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

/**
 * Per-file ceiling for an image, the server's own. Every shell uses the same one to avoid "it worked
 * on my phone"; the web shell also holds a whole picked photo in memory while it prepares it, and the
 * app hands each one over as base64.
 */
export const CHAT_IMAGE_MAX_BYTES = CHAT_ATTACHMENT_MAX_BYTES.image;

/** Why a picked file was not taken, judged in this order. Kept for the image-only callers. */
export type ChatImageRejection = 'unsupported' | 'too-large' | 'duplicate' | 'limit';

export interface ChatImageJudgement {
    /** Files to send, in the order they were picked. */
    accepted: File[];
    rejected: { file: File; reason: ChatImageRejection }[];
}

/**
 * Why a picked attachment was not taken, judged in this order: the first two are the item's own
 * properties, the last two its relation to the rest of the pick. `too-large` names the kind, because
 * the limits differ and the notice has to say which one was passed ("videos up to 300MB").
 */
export type ChatAttachmentRejection =
    | { reason: 'unsupported' | 'duplicate' | 'limit' }
    | { reason: 'too-large'; kind: ChatUploadKind };

export interface ChatAttachmentJudgement<T extends ChatAttachmentSource> {
    /** Items to send, in the order they were picked. */
    accepted: T[];
    rejected: ({ item: T } & ChatAttachmentRejection)[];
}

/**
 * What the item is sent as. An iOS video the shell has yet to convert is judged as what it will be — an
 * `mp4` — since its own type (`video/quicktime`) is one the server refuses and the conversion exists
 * precisely to change it.
 */
export const chatAttachmentSourceFormat = (item: ChatAttachmentSource): ChatAttachmentFormat | null =>
    isShellFileRef(item) && item.needsExport
        ? chatAttachmentFormat({ name: `${item.name.replace(/\.[^.]*$/, '')}.mp4`, type: 'video/mp4' })
        : chatAttachmentFormat(item);

/**
 * Whether the item's size is still to be decided by the shell's conversion. A 4K HEVC source runs at
 * about 170MB a minute, so judged by it against the 300MB limit a clip under two minutes would be
 * refused that converts to well under it. The shell's estimate before converting, and the check of its
 * result after, decide instead.
 */
const awaitsExport = (item: ChatAttachmentSource): boolean => isShellFileRef(item) && !!item.needsExport;

/**
 * Name + size + mtime for a page file, rather than a content hash: hashing would read every picked file
 * in full, and the pick that matters here is the same photo tapped twice, which these three already
 * catch. A shell file has no mtime, but its address is its own: the shell copies each pick to a new one.
 */
const itemKey = (item: ChatAttachmentSource): string =>
    isShellFileRef(item) ? `shell:${item.uri}` : `${item.name}:${item.size}:${item.lastModified}`;

const judge = <T extends ChatAttachmentSource>(
    items: readonly T[],
    max: number,
    takes: ChatAttachmentFilter
): ChatAttachmentJudgement<T> => {
    const accepted: T[] = [];
    const rejected: ChatAttachmentJudgement<T>['rejected'] = [];
    const seen = new Set<string>();

    for (const item of items) {
        const format = chatAttachmentSourceFormat(item);
        if (!format || !takes(format)) rejected.push({ item, reason: 'unsupported' });
        else if (!awaitsExport(item) && item.size > CHAT_ATTACHMENT_MAX_BYTES[format.kind]) {
            rejected.push({ item, reason: 'too-large', kind: format.kind });
        } else if (seen.has(itemKey(item))) rejected.push({ item, reason: 'duplicate' });
        else if (accepted.length >= max) rejected.push({ item, reason: 'limit' });
        else {
            seen.add(itemKey(item));
            accepted.push(item);
        }
    }
    return { accepted, rejected };
};

/**
 * Sorts a pick into what can be sent and what cannot, and why: the server's thirteen formats, each
 * kind's own size limit, the same item picked twice, and the per-message limit.
 *
 * `max` is the per-message limit. It is passed in rather than imported so this module does not depend
 * on the send sequence that owns it — callers pass that one constant. `sends` is for an app that sends
 * fewer formats than the server takes: a format it turns down is `unsupported`.
 */
export const judgeChatAttachments = <T extends ChatAttachmentSource>(
    items: readonly T[],
    max: number,
    sends: ChatAttachmentFilter = () => true
): ChatAttachmentJudgement<T> => judge(items, max, sends);

/** `judgeChatAttachments` for a pick that may hold images only: anything else is `unsupported`. */
export const judgeChatImages = (files: readonly File[], max: number): ChatImageJudgement => {
    const { accepted, rejected } = judge(files, max, format => format.kind === 'image');
    return { accepted, rejected: rejected.map(({ item, reason }) => ({ file: item, reason })) };
};

/**
 * How many images a chat carries. `upload$$` when the row has it — a sent row, or one still on its
 * way — and `uploadIds` otherwise, which is all a channel list's last-chat head carries.
 */
export const chatImageCount = (chat: Pick<DomainChat, 'upload$$' | 'uploadIds'> | null | undefined): number =>
    chat?.upload$$?.length ?? chat?.uploadIds?.length ?? 0;

/** What a message's attachments are, as a preview names them. `mixed` covers kinds that differ and `audio`. */
export type ChatAttachmentKind = 'image' | 'video' | 'file' | 'mixed';

const NAMED_KINDS: readonly string[] = ['image', 'video', 'file'];

/**
 * What a chat carries, for a preview: one kind when every attachment is the same image, video or
 * file, else `mixed`, with the count `chatImageCount` gives. `null` when nothing is attached. The
 * same kinds name a push's body key, so a row and its push are meant to agree.
 */
export const chatAttachmentSummary = (
    chat: Pick<DomainChat, 'upload$$' | 'uploadIds'> | null | undefined
): { kind: ChatAttachmentKind; count: number } | null => {
    const count = chatImageCount(chat);
    if (count === 0) return null;
    // A head with only `uploadIds` knows no kinds, and before other kinds existed every one was an image.
    const kinds = new Set<string>((chat?.upload$$ ?? []).map(uploadSlotKind));
    if (kinds.size === 0) return { kind: 'image', count };
    const [only] = kinds;
    return { kind: kinds.size === 1 && NAMED_KINDS.includes(only) ? (only as ChatAttachmentKind) : 'mixed', count };
};
