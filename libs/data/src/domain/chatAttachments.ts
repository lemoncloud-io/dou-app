import { CHAT_IMAGE_MAX_BYTES } from './chatImages';

/**
 * The formats a chat message may carry, as the server takes them: which files may be sent, under
 * which content type and name, and how large each kind may be. Kept here so a picker can refuse a
 * file before its upload starts, instead of learning it from a 400, 413 or 415.
 */

/** The kinds of upload the server stores. `audio` exists in the contract but is not accepted. */
export type ChatUploadKind = 'image' | 'video' | 'file';

interface Format {
    type: string;
    /** Lower case, without the dot. The first is the one added to a name that has none. */
    extensions: readonly string[];
    kind: ChatUploadKind;
}

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
    { type: 'application/x-hwp', extensions: ['hwp'], kind: 'file' },
    { type: 'application/hwp+zip', extensions: ['hwpx'], kind: 'file' },
    { type: 'text/plain', extensions: ['txt'], kind: 'file' },
];

// HWP and HWPX have no registered MIME type, and Hancom's own tools label them in several ways.
const ALIASES: Readonly<Record<string, string>> = {
    'application/haansofthwp': 'application/x-hwp',
    'application/vnd.hancom.hwp': 'application/x-hwp',
    'application/vnd.hancom.hwpx': 'application/hwp+zip',
    'application/haansofthwpx': 'application/hwp+zip',
};

/** Per-file ceiling for each kind, the same as the server's. */
export const CHAT_ATTACHMENT_MAX_BYTES: Readonly<Record<ChatUploadKind, number>> = {
    image: CHAT_IMAGE_MAX_BYTES,
    video: 300 * 1024 * 1024,
    file: 50 * 1024 * 1024,
};

/** What a picked file is sent as. */
export interface ChatAttachmentFormat {
    /** The content type to declare: the server's name for the format, whatever the file said. */
    type: string;
    kind: ChatUploadKind;
    /** The name to send. A video or document without an extension gets its format's. */
    name: string;
}

// The server's rule: the text after the last dot, unless that dot is the first or last character.
const extensionOf = (name: string): string | null => {
    const dot = name.lastIndexOf('.');
    return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : null;
};

/**
 * What a picked file will be sent as, or `null` when the server would refuse it.
 *
 * The declared type decides when it is one of ours. Otherwise the extension does: a browser hands a
 * file its system does not know (HWP, often) over with an empty type. A video or document must end in
 * its format's extension, because the receiver saves it under that name — another format's extension
 * is refused, anything else gets the right one added. An image name is left alone; the server does not check it.
 */
export const chatAttachmentFormat = (file: Pick<File, 'name' | 'type'>): ChatAttachmentFormat | null => {
    const declared = ALIASES[file.type] ?? file.type;
    const extension = extensionOf(file.name);
    const format =
        FORMATS.find(candidate => candidate.type === declared) ??
        FORMATS.find(candidate => extension !== null && candidate.extensions.includes(extension));
    if (!format) return null;
    const { type, kind } = format;
    if (kind === 'image') return { type, kind, name: file.name };
    if (extension !== null && format.extensions.includes(extension)) return { type, kind, name: file.name };
    // Another format's extension means the name and the type disagree about what the file is.
    if (extension !== null && FORMATS.some(other => other.extensions.includes(extension))) return null;
    // No extension, or a tail that is not one ("v1.2", "run.js"): the format's own goes after it, so
    // the receiver never saves a document under a name that would run as something else.
    return { type, kind, name: `${file.name}.${format.extensions[0]}` };
};
