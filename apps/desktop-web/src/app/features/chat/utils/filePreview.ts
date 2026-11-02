import { chatAttachmentFormat } from '@chatic/data';

import type { ChatFile } from './chatImages';

/** What the viewer draws a file as. */
export type FilePreview = 'pdf' | 'text' | 'audio';

const PREVIEWS: Readonly<Record<string, FilePreview>> = {
    'application/pdf': 'pdf',
    'text/plain': 'text',
    'audio/mpeg': 'audio',
    'audio/mp4': 'audio',
    'audio/wav': 'audio',
    'audio/ogg': 'audio',
};

/**
 * Whether a sent file opens in the viewer, and as what. A PDF or a text file is drawn, a voice file
 * played: nothing in the page draws an office or Hancom document without handing it to a third party,
 * and a video already plays in place. A file being sent, failed, or without an address has nothing to
 * open.
 */
export const canPreview = (file: ChatFile): FilePreview | null => {
    if (file.kind !== 'file' || !file.url || file.isUploading || file.isFailed) return null;
    const format = chatAttachmentFormat({ name: file.name ?? '', type: file.contentType ?? '' });
    return (format && PREVIEWS[format.type]) ?? null;
};

/**
 * A playback position or length as the inline player shows it: `m:ss`, and `h:mm:ss` from an hour.
 * Rounded down, so the clock never reads a second the file has not reached. A length the browser
 * does not know yet (`NaN`, or `Infinity` for a stream) is `0:00`.
 */
export const formatPlaybackTime = (seconds: number): string => {
    const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = String(total % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
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
