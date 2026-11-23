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

export const CHAT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

export type ChatImageRejection = 'unsupported' | 'too-large' | 'duplicate' | 'limit';

export interface ChatImageJudgement {
    accepted: File[];
    rejected: { file: File; reason: ChatImageRejection }[];
}

export type ChatAttachmentRejection =
    | { reason: 'unsupported' | 'duplicate' | 'limit' }
    | { reason: 'too-large'; kind: ChatUploadKind };

export interface ChatAttachmentJudgement<T extends ChatAttachmentSource> {
    accepted: T[];
    rejected: ({ item: T } & ChatAttachmentRejection)[];
}

export const chatAttachmentSourceFormat = (item: ChatAttachmentSource): ChatAttachmentFormat | null =>
    isShellFileRef(item) && item.needsExport
        ? chatAttachmentFormat({ name: `${item.name.replace(/\.[^.]*$/, '')}.mp4`, type: 'video/mp4' })
        : chatAttachmentFormat(item);

const awaitsExport = (item: ChatAttachmentSource): boolean => isShellFileRef(item) && !!item.needsExport;

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

export const judgeChatAttachments = <T extends ChatAttachmentSource>(
    items: readonly T[],
    max: number,
    sends: ChatAttachmentFilter = () => true
): ChatAttachmentJudgement<T> => judge(items, max, sends);

export const judgeChatImages = (files: readonly File[], max: number): ChatImageJudgement => {
    const { accepted, rejected } = judge(files, max, format => format.kind === 'image');
    return { accepted, rejected: rejected.map(({ item, reason }) => ({ file: item, reason })) };
};

export const chatImageCount = (chat: Pick<DomainChat, 'upload$$' | 'uploadIds'> | null | undefined): number =>
    chat?.upload$$?.length ?? chat?.uploadIds?.length ?? 0;

export type ChatAttachmentKind = 'image' | 'video' | 'file' | 'mixed';

const NAMED_KINDS: readonly string[] = ['image', 'video', 'file'];

export const chatAttachmentSummary = (
    chat: Pick<DomainChat, 'upload$$' | 'uploadIds'> | null | undefined
): { kind: ChatAttachmentKind; count: number } | null => {
    const count = chatImageCount(chat);
    if (count === 0) return null;
    const kinds = new Set<string>((chat?.upload$$ ?? []).map(uploadSlotKind));
    if (kinds.size === 0) return { kind: 'image', count };
    const [only] = kinds;
    return { kind: kinds.size === 1 && NAMED_KINDS.includes(only) ? (only as ChatAttachmentKind) : 'mixed', count };
};
