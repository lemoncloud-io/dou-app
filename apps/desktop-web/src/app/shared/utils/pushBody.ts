import i18next from 'i18next';

import type { ChatAttachmentKind } from '@chatic/data';

import { attachmentLabel } from './messagePreview';
import { messagePlainText } from './messagePlainText';

/**
 * The server picks a chat push's body key by what the message carries: text, or one of these when
 * it has none. A single key names the kind; a plural one takes the count as its first loc arg.
 */
const ATTACHMENT_KEYS: Record<string, { kind: ChatAttachmentKind; plural: boolean }> = {
    push_chat_image_body: { kind: 'image', plural: false },
    push_chat_images_body: { kind: 'image', plural: true },
    push_chat_video_body: { kind: 'video', plural: false },
    push_chat_videos_body: { kind: 'video', plural: true },
    push_chat_file_body: { kind: 'file', plural: false },
    push_chat_files_body: { kind: 'file', plural: true },
    push_chat_attachments_body: { kind: 'mixed', plural: true },
};

// FCM carries loc_args as a JSON string, and the shell forwards it untouched; an array is accepted too.
const firstLocArg = (raw: unknown): string | undefined => {
    let args = raw;
    if (typeof raw === 'string') {
        try {
            args = JSON.parse(raw);
        } catch {
            return undefined;
        }
    }
    return Array.isArray(args) && args.length > 0 ? String(args[0]) : undefined;
};

const fallback = (): string => i18next.t('chat.push.fallbackBody');

/**
 * The body a forwarded chat push should show, when it has to be made here: an attachment named the
 * way the sidebar names it, or "New message" when the push says nothing. `undefined` leaves the
 * body the shell derived — a text message, or any push this does not know.
 */
export const pushBody = (data: Record<string, unknown>): string | undefined => {
    const key = typeof data.loc_key === 'string' ? data.loc_key : '';
    const attachment = ATTACHMENT_KEYS[key];
    if (attachment) {
        if (!attachment.plural) return attachmentLabel({ kind: attachment.kind, count: 1 });
        const count = Number(firstLocArg(data.loc_args));
        // No number rather than a wrong one when the count cannot be read.
        return Number.isInteger(count) && count > 0 ? attachmentLabel({ kind: attachment.kind, count }) : fallback();
    }
    // An attachment-only message pushed before the server named kinds: no text and no args.
    // Flattened the way the presenter reads it, so a Block Kit payload with no text is empty too.
    const text = messagePlainText(String(data.content ?? firstLocArg(data.loc_args) ?? '')).trim();
    if (key === 'push_chat_message_body' && !text) {
        return fallback();
    }
    return undefined;
};
