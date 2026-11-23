import { isPendingUploadSlot } from '../uploads/types';

import type { DomainChat } from './models';

export type ChatUploadKind = 'image' | 'video' | 'file';

interface Format {
    type: string;
    extensions: readonly string[];
    kind: ChatUploadKind;
}

export const CHAT_ATTACHMENT_ZIP_TYPE = 'application/zip';

const FORMATS: readonly Format[] = [
    { type: 'image/png', extensions: ['png'], kind: 'image' },
    { type: 'image/jpeg', extensions: ['jpg', 'jpeg'], kind: 'image' },
    { type: 'image/gif', extensions: ['gif'], kind: 'image' },
    { type: 'image/webp', extensions: ['webp'], kind: 'image' },
    { type: 'video/mp4', extensions: ['mp4'], kind: 'video' },
    { type: 'application/pdf', extensions: ['pdf'], kind: 'file' },
    {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extensions: ['docx'],
        kind: 'file',
    },
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extensions: ['xlsx'], kind: 'file' },
    {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        extensions: ['pptx'],
        kind: 'file',
    },
    { type: 'application/msword', extensions: ['doc'], kind: 'file' },
    { type: 'application/vnd.ms-excel', extensions: ['xls'], kind: 'file' },
    { type: 'application/vnd.ms-powerpoint', extensions: ['ppt'], kind: 'file' },
    { type: 'application/x-hwp', extensions: ['hwp'], kind: 'file' },
    { type: 'application/hwp+zip', extensions: ['hwpx'], kind: 'file' },
    { type: 'text/plain', extensions: ['txt'], kind: 'file' },
    { type: 'text/csv', extensions: ['csv'], kind: 'file' },
    { type: 'text/markdown', extensions: ['md'], kind: 'file' },
    { type: 'application/json', extensions: ['json'], kind: 'file' },
    { type: 'text/html', extensions: ['html', 'htm'], kind: 'file' },
    { type: CHAT_ATTACHMENT_ZIP_TYPE, extensions: ['zip'], kind: 'file' },
    { type: 'audio/mp4', extensions: ['m4a'], kind: 'file' },
    { type: 'audio/mpeg', extensions: ['mp3'], kind: 'file' },
    { type: 'audio/wav', extensions: ['wav'], kind: 'file' },
    { type: 'audio/ogg', extensions: ['ogg'], kind: 'file' },
];

const ALIASES: Readonly<Record<string, string>> = {
    'application/haansofthwp': 'application/x-hwp',
    'application/vnd.hancom.hwp': 'application/x-hwp',
    'application/vnd.hancom.hwpx': 'application/hwp+zip',
    'application/haansofthwpx': 'application/hwp+zip',
    'application/x-zip-compressed': CHAT_ATTACHMENT_ZIP_TYPE,
    'application/x-zip': CHAT_ATTACHMENT_ZIP_TYPE,
    'audio/x-m4a': 'audio/mp4',
    'audio/m4a': 'audio/mp4',
    'audio/mp3': 'audio/mpeg',
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'audio/vnd.wave': 'audio/wav',
};

export type ChatAttachmentFilter = (format: { type: string; kind: ChatUploadKind }) => boolean;

export const chatAttachmentAccept = (
    kinds: readonly ChatUploadKind[],
    sends: ChatAttachmentFilter = () => true
): string => {
    const formats = FORMATS.filter(format => kinds.includes(format.kind) && sends(format));
    return [
        ...formats.map(format => format.type),
        ...formats.flatMap(format => format.extensions.map(extension => `.${extension}`)),
    ].join(',');
};

export const CHAT_ATTACHMENT_ACCEPT = chatAttachmentAccept(['image', 'video', 'file']);

export const chatAttachmentExtension = (type: string): string | undefined =>
    FORMATS.find(format => format.type === type)?.extensions[0];

export const CHAT_ATTACHMENT_MAX_BYTES: Readonly<Record<ChatUploadKind, number>> = {
    image: 20 * 1024 * 1024,
    video: 300 * 1024 * 1024,
    file: 50 * 1024 * 1024,
};

export const CHAT_ATTACHMENT_MAX_NAME_BYTES = 255;

export const isChatAttachmentNameTooLong = (name: string): boolean =>
    new TextEncoder().encode(name.normalize('NFC')).length > CHAT_ATTACHMENT_MAX_NAME_BYTES;

export interface ChatAttachmentFormat {
    type: string;
    kind: ChatUploadKind;
    name: string;
}

const extensionOf = (name: string): string | null => {
    const dot = name.lastIndexOf('.');
    return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : null;
};

const UNTYPED: ReadonlySet<string> = new Set(['', 'application/octet-stream']);

const LEGACY_OFFICE: ReadonlySet<string> = new Set([
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
]);

const OFFICE_CONTAINERS: ReadonlySet<string> = new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/hwp+zip',
]);

export const chatAttachmentFormat = (file: Pick<File, 'name' | 'type'>): ChatAttachmentFormat | null => {
    const declared = ALIASES[file.type] ?? file.type;
    const extension = extensionOf(file.name);
    const named = FORMATS.find(candidate => extension !== null && candidate.extensions.includes(extension));
    const typed = FORMATS.find(candidate => candidate.type === declared);
    const readsName =
        UNTYPED.has(declared) ||
        (named !== undefined &&
            OFFICE_CONTAINERS.has(named.type) &&
            (typed === undefined || typed.type === CHAT_ATTACHMENT_ZIP_TYPE || LEGACY_OFFICE.has(typed.type)));
    const format = readsName ? named : typed;
    if (!format) return null;
    const { type, kind } = format;
    if (kind === 'image') return { type, kind, name: file.name };
    if (extension !== null && format.extensions.includes(extension)) return { type, kind, name: file.name };
    if (extension !== null && FORMATS.some(other => other.extensions.includes(extension))) return null;
    return { type, kind, name: `${file.name}.${format.extensions[0]}` };
};

export const chatAttachmentStoredKind = (file: Pick<File, 'name' | 'type'>): ChatUploadKind | 'audio' | null => {
    const format = chatAttachmentFormat(file);
    if (!format) return null;
    return format.type.startsWith('audio/') ? 'audio' : format.kind;
};

export const uploadSlotKind = (slot: NonNullable<DomainChat['upload$$']>[number]): ChatUploadKind | 'audio' => {
    if (isPendingUploadSlot(slot)) {
        if (!slot.localContentType) return 'image';
        return chatAttachmentStoredKind({ name: slot.localName ?? '', type: slot.localContentType }) ?? 'file';
    }
    return slot.stereo || 'image';
};
