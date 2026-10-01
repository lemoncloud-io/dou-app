import { chatAttachmentFormat } from '@chatic/data';

import type { ChatFile } from './chatImages';

/** What the viewer draws a file as. */
export type FilePreview = 'pdf' | 'text';

const PREVIEWS: Readonly<Record<string, FilePreview>> = {
    'application/pdf': 'pdf',
    'text/plain': 'text',
};

/**
 * Whether a sent file opens in the viewer, and as what. Only a PDF or a text file: nothing in the
 * page draws an office or Hancom document without handing it to a third party, and a video already
 * plays in place. A file being sent, failed, or without an address has nothing to open.
 */
export const canPreview = (file: ChatFile): FilePreview | null => {
    if (file.kind !== 'file' || !file.url || file.isUploading || file.isFailed) return null;
    const format = chatAttachmentFormat({ name: file.name ?? '', type: file.contentType ?? '' });
    return (format && PREVIEWS[format.type]) ?? null;
};

/** How much of a text file the viewer shows. The whole file is still what a save writes. */
export const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;

/**
 * The start of a text file, decoded. A UTF-16 byte-order mark (Notepad's "Unicode") picks UTF-16;
 * otherwise UTF-8, and bytes that are not UTF-8 are read as EUC-KR, which is what a `.txt` saved by
 * Korean Windows usually is. Only the first `TEXT_PREVIEW_MAX_BYTES` are read: a 50 MB `<pre>`
 * stalls the window. `fileSize` is the whole file's, when `blob` may hold only its start.
 */
export const readTextPreview = async (blob: Blob, fileSize?: number): Promise<{ text: string; truncated: boolean }> => {
    // Without the file's size, a start that fills the whole allowance is taken to be cut.
    const truncated = fileSize === undefined ? blob.size >= TEXT_PREVIEW_MAX_BYTES : fileSize > TEXT_PREVIEW_MAX_BYTES;
    const bytes = new Uint8Array(await blob.slice(0, TEXT_PREVIEW_MAX_BYTES).arrayBuffer());
    const utf16 =
        bytes[0] === 0xff && bytes[1] === 0xfe
            ? 'utf-16le'
            : bytes[0] === 0xfe && bytes[1] === 0xff
              ? 'utf-16be'
              : null;
    if (utf16) return { text: new TextDecoder(utf16).decode(bytes, { stream: truncated }), truncated };
    try {
        // `stream` holds back a character the cut split in two instead of calling it invalid.
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: truncated }), truncated };
    } catch {
        return { text: new TextDecoder('euc-kr').decode(bytes, { stream: truncated }), truncated };
    }
};
