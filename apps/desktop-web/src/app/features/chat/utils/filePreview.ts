import { chatAttachmentExtension, chatAttachmentFormat } from '@chatic/data';

import type { ChatFile } from './chatImages';

/** What the viewer draws a file as. */
export type FilePreview = 'pdf' | 'text' | 'html' | 'audio';

const PREVIEWS: Readonly<Record<string, FilePreview>> = {
    'application/pdf': 'pdf',
    'text/plain': 'text',
    'text/html': 'html',
    // In the order the drop zone names them: m4a, the phone recorder's, first.
    'audio/mp4': 'audio',
    'audio/mpeg': 'audio',
    'audio/wav': 'audio',
    'audio/ogg': 'audio',
};

/** The extensions of the voice files the feed plays — "m4a, mp3, wav, ogg" in the drop zone. */
export const VOICE_EXTENSIONS: readonly string[] = Object.keys(PREVIEWS)
    .filter(type => PREVIEWS[type] === 'audio')
    .map(type => chatAttachmentExtension(type))
    .filter((extension): extension is string => !!extension);

/**
 * Whether a sent file opens in the viewer, and as what. A PDF, a text file or an HTML page is drawn, a
 * voice file played: nothing in the page draws an office or Hancom document without handing it to a third party,
 * and a video already plays in place. A file being sent, failed, or without an address has nothing to
 * open.
 */
export const canPreview = (file: ChatFile): FilePreview | null => {
    if (file.kind !== 'file' || !file.url || file.isUploading || file.isFailed) return null;
    return previewOf(file);
};

const previewOf = (file: ChatFile): FilePreview | null => {
    const format = chatAttachmentFormat({ name: file.name ?? '', type: file.contentType ?? '' });
    return (format && PREVIEWS[format.type]) ?? null;
};

/** A voice file — sent, on its way, or failed — which the feed draws as a voice card in every state. */
export const isVoiceFile = (file: ChatFile): boolean => file.kind === 'file' && previewOf(file) === 'audio';

/**
 * A file name split before its extension, so a name cut short to fit still shows what kind of file it
 * is: the stem gives way, the extension stays. A name with no extension, or only one (".env"), is all stem.
 */
export const splitFileName = (name: string): { stem: string; extension: string } => {
    const dot = name.lastIndexOf('.');
    return dot > 0 && dot < name.length - 1
        ? { stem: name.slice(0, dot), extension: name.slice(dot) }
        : { stem: name, extension: '' };
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
 * The largest HTML page the viewer draws. A page cut short renders broken, so one past this is not drawn
 * at all and is saved instead. Larger than a text file's: a saved report carries its images inline.
 */
export const HTML_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Put ahead of a received page. Someone else wrote it, so it may load nothing from the network — a remote
 * image is a read receipt and a leak of the reader's address — and the frame it is drawn in runs no
 * script anyway. Styles, images and fonts the page carries inline still draw.
 */
const HTML_PREVIEW_POLICY =
    "default-src 'none'; style-src 'unsafe-inline' data:; img-src data:; font-src data:; media-src data:; form-action 'none'";

/**
 * The head put in front of a page: the policy, no referrer, and a base whose `_blank` target the frame
 * refuses (it may open no window), so a link without a target of its own opens nothing, an in-page
 * link (`#part`) included. Only the first base element's target counts, so the page's own base cannot
 * undo it. A link that names its own target (`_self`) still wins over any base; what stops it taking
 * the frame to another site is the desktop shell, which refuses a frame navigation to an origin it does
 * not trust. In a plain browser the frame follows it: the page it lands on still runs no script, but
 * it is no longer under the policy. A `<meta http-equiv="refresh">` does not navigate a frame sandboxed
 * without scripts.
 */
const HTML_PREVIEW_HEAD =
    `<meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_POLICY}">` +
    '<meta name="referrer" content="no-referrer"><base target="_blank">';

/**
 * The page with the head above put first inside its `<head>`. The page is parsed with the same parser
 * the frame uses, in a document that runs and loads nothing, and written back out: a policy only counts
 * from inside the head, and finding where the head starts by scanning the text would disagree with the
 * parser on a page built to make it — a comment closed early (`<!-->`) is enough to start the body
 * ahead of a policy put after it, and the page then loads from the network. The doctype is written back
 * as it was, so the page keeps its layout mode; anything outside the root element, such as a comment
 * ahead of the doctype, is dropped.
 */
export const htmlPreviewDocument = (html: string): string => {
    const page = new DOMParser().parseFromString(html.replace(/^\uFEFF/, ''), 'text/html');
    page.head.insertAdjacentHTML('afterbegin', HTML_PREVIEW_HEAD);
    const doctype = page.doctype ? new XMLSerializer().serializeToString(page.doctype) : '';
    return `${doctype}${page.documentElement.outerHTML}`;
};

/**
 * The start of a text file, decoded. A UTF-16 byte-order mark (Notepad's "Unicode") picks UTF-16;
 * otherwise UTF-8, and bytes that are not UTF-8 are read as EUC-KR, which is what a `.txt` saved by
 * Korean Windows usually is. Only the first `maxBytes` are read: a 50 MB `<pre>` stalls the window.
 * `fileSize` is the whole file's, when `blob` may hold only its start. An HTML page is decoded the same
 * way, with its own allowance.
 */
export const readTextPreview = async (
    blob: Blob,
    fileSize?: number,
    maxBytes: number = TEXT_PREVIEW_MAX_BYTES
): Promise<{ text: string; truncated: boolean }> => {
    // Without the file's size, a start that fills the whole allowance is taken to be cut.
    const truncated = fileSize === undefined ? blob.size >= maxBytes : fileSize > maxBytes;
    const bytes = new Uint8Array(await blob.slice(0, maxBytes).arrayBuffer());
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
