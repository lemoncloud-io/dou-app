import type { DomainChat } from './models';

/**
 * Image-message rules the screens share: which files may be picked, how many images a chat
 * carries, and what kind of attachment a preview should name. The send sequence itself lives in
 * `uploads/`; this is the part a picker and a list row both need before or without it.
 */

/** The formats the server accepts. Anything else is refused before an upload is started. */
export const CHAT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

/**
 * Per-file ceiling for the page. The server's own limit is far higher, but the web shell holds a
 * whole picked photo in memory while it prepares it, and the app hands each one over as base64 —
 * so the limit is the page's, and every shell uses the same one to avoid "it worked on my phone".
 */
export const CHAT_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Why a picked file was not taken, judged in this order: the first two are the file's own
 * properties, the last two its relation to the rest of the pick.
 */
export type ChatImageRejection = 'unsupported' | 'too-large' | 'duplicate' | 'limit';

export interface ChatImageJudgement {
    /** Files to send, in the order they were picked. */
    accepted: File[];
    rejected: { file: File; reason: ChatImageRejection }[];
}

// A HEIC may arrive typed empty from some pickers; the name is the only clue left, and it is not
// one of ours either way, so an untyped file is judged by nothing and refused.
const isAcceptedType = (file: File): boolean => (CHAT_IMAGE_TYPES as readonly string[]).includes(file.type);

// Name + size + mtime rather than a content hash: hashing would read every picked file in full,
// and the pick that matters here is the same photo tapped twice, which these three already catch.
const fileKey = (file: File): string => `${file.name}:${file.size}:${file.lastModified}`;

/**
 * Sorts a pick into what can be sent and what cannot, and why.
 *
 * `max` is the per-message image limit. It is passed in rather than imported so this module does
 * not depend on the send sequence that owns it — callers pass that one constant.
 */
export const judgeChatImages = (files: readonly File[], max: number): ChatImageJudgement => {
    const accepted: File[] = [];
    const rejected: ChatImageJudgement['rejected'] = [];
    const seen = new Set<string>();

    for (const file of files) {
        if (!isAcceptedType(file)) rejected.push({ file, reason: 'unsupported' });
        else if (file.size > CHAT_IMAGE_MAX_BYTES) rejected.push({ file, reason: 'too-large' });
        else if (seen.has(fileKey(file))) rejected.push({ file, reason: 'duplicate' });
        else if (accepted.length >= max) rejected.push({ file, reason: 'limit' });
        else {
            seen.add(fileKey(file));
            accepted.push(file);
        }
    }
    return { accepted, rejected };
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

// Read as a plain string: the server names documents `file` and sound `audio`, while the installed
// contract types still say `docs` and `sound`, so a typed comparison would never match live data.
const slotKind = (slot: object): string => {
    const stereo = 'stereo' in slot ? (slot.stereo as string | undefined) : undefined;
    // A slot still being sent has no stereo, and a message sent before the server took other kinds
    // was an image message — both count as images.
    return stereo || 'image';
};

/**
 * What a chat carries, for a preview: one kind when every attachment is the same image, video or
 * file, else `mixed`, with the count `chatImageCount` gives. `null` when nothing is attached. The
 * rule is meant to match how the server picks a push body key, so a row and its push agree.
 */
export const chatAttachmentSummary = (
    chat: Pick<DomainChat, 'upload$$' | 'uploadIds'> | null | undefined
): { kind: ChatAttachmentKind; count: number } | null => {
    const count = chatImageCount(chat);
    if (count === 0) return null;
    // A head with only `uploadIds` knows no kinds, and before other kinds existed every one was an image.
    const kinds = new Set((chat?.upload$$ ?? []).map(slotKind));
    if (kinds.size === 0) return { kind: 'image', count };
    const [only] = kinds;
    return { kind: kinds.size === 1 && NAMED_KINDS.includes(only) ? (only as ChatAttachmentKind) : 'mixed', count };
};
