import i18next from 'i18next';

import type { ChatAttachmentKind } from '@chatic/runtime-react';

import { attachmentLabel } from './messagePreview';
import { messagePlainText } from './messagePlainText';

const ATTACHMENT_KEYS: Record<string, { kind: ChatAttachmentKind; plural: boolean }> = {
    push_chat_image_body: { kind: 'image', plural: false },
    push_chat_images_body: { kind: 'image', plural: true },
    push_chat_video_body: { kind: 'video', plural: false },
    push_chat_videos_body: { kind: 'video', plural: true },
    push_chat_file_body: { kind: 'file', plural: false },
    push_chat_files_body: { kind: 'file', plural: true },
    push_chat_attachments_body: { kind: 'mixed', plural: true },
};

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

export const pushBody = (data: Record<string, unknown>, shellBody?: string): string | undefined => {
    const key = typeof data.loc_key === 'string' ? data.loc_key : '';
    const attachment = ATTACHMENT_KEYS[key];
    if (attachment) {
        if (!attachment.plural) return attachmentLabel({ kind: attachment.kind, count: 1 });
        const count = Number(firstLocArg(data.loc_args));
        return Number.isInteger(count) && count > 0 ? attachmentLabel({ kind: attachment.kind, count }) : fallback();
    }
    const text = messagePlainText(String(data.content || firstLocArg(data.loc_args) || shellBody || '')).trim();
    if (key === 'push_chat_message_body' && !text) {
        return fallback();
    }
    return undefined;
};
