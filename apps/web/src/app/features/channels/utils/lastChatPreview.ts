import { chatAttachmentSummary, type ChatAttachmentKind, type DomainChat } from '@chatic/data';

import { messagePreview } from './messagePlainText';

/** The slice of `i18next`'s `t` this needs, so a caller passes its own and a test passes a stub. */
type Translate = (key: string, options?: { count?: number; name?: string; text?: string }) => string;

// Nouns and counters match the push for the same message ("사진 3장" / "사진 3장을 보냈습니다"),
// so changing one of them means changing the push copy in the mobile locales too. `mixed` has no
// one-attachment form: a single attachment is a single kind, except a lone audio file, which the
// count form covers.
const ATTACHMENT_PREVIEW_KEYS: Record<ChatAttachmentKind, { one?: string; many: string }> = {
    image: { one: 'chat.attach.preview', many: 'chat.attach.previewCount' },
    video: { one: 'chat.attach.previewVideo', many: 'chat.attach.previewVideoCount' },
    file: { one: 'chat.attach.previewFile', many: 'chat.attach.previewFileCount' },
    mixed: { many: 'chat.attach.previewMixedCount' },
};

const attachmentPreviewKey = ({ kind, count }: { kind: ChatAttachmentKind; count: number }): string => {
    const keys = ATTACHMENT_PREVIEW_KEYS[kind];
    return count === 1 && keys.one ? keys.one : keys.many;
};

/**
 * A room's last message as the one line a room row prints under its name — the home list, a
 * search result's room row and the place's channel-management list all read this, so the same
 * message reads the same on all three. '' when there is nothing to print.
 *
 * A tombstone (`hidden`) still previews: it IS the room's last message, and the room renders it as
 * the deleted-message phrase, so the row says the same. What it must not print is the body — a
 * soft delete keeps `content` on the row, server and cache alike — so it is checked first.
 *
 * Text is flattened by `messagePreview`, not rendered: a one-line row has nowhere to put a code
 * block, and leaving the markers in would make the row dirtier than plain text.
 *
 * An attachment-only message carries no text, so its row would read as a blank line. It previews
 * as what it carries instead — "Photo", "3 videos", "2 attachments" — using the push's nouns.
 * A message with both text and attachments previews its text.
 *
 * A thread reply leads with a thread mark, so a reply does not read as a message in the room itself.
 * A group room's row passes the `sender`, which goes between the mark and the line; a 1:1 or a self
 * chat has only one other party (or none), and an unresolved name is left out rather than guessed.
 */
export const lastChatPreview = (
    chat: Pick<DomainChat, 'content' | 'hidden' | 'upload$$' | 'uploadIds' | 'parentId'> | null | undefined,
    t: Translate,
    sender?: string
): string => {
    const line = previewLine(chat, t);
    if (!chat || !line) return '';
    const name = sender?.trim();
    const withSender = name ? t('chat.preview.sender', { name, text: line }) : line;
    return chat.parentId ? t('chat.preview.thread', { text: withSender }) : withSender;
};

const previewLine = (
    chat: Pick<DomainChat, 'content' | 'hidden' | 'upload$$' | 'uploadIds'> | null | undefined,
    t: Translate
): string => {
    if (!chat) return '';
    if (chat.hidden) return t('chat.room.deletedMessage');
    const text = messagePreview(chat.content);
    if (text) return text;
    const attachments = chatAttachmentSummary(chat);
    return attachments ? t(attachmentPreviewKey(attachments), { count: attachments.count }) : '';
};
