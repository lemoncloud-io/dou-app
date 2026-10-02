/**
 * The pure rules a chat document card draws by: which glyph a file name gets, how the name splits so
 * its extension is never cut off, and how a byte count reads. Kept apart from the component so each
 * rule is tested on its own and a host can reuse them (a toast that names the file, say).
 */

/** The families of document a card tells apart. `file` is everything else. */
export type MessageFileKind = 'pdf' | 'doc' | 'sheet' | 'slides' | 'hangul' | 'text' | 'file';

/**
 * A file name as the card draws it: the body, which may be cut short, and the extension (with its
 * dot), which never is. A name with no extension is all body.
 */
export interface MessageFileNameParts {
    base: string;
    extension: string;
}

/**
 * Splits off the extension by the server's own rule: the text after the last dot, unless that dot is
 * the first or the last character. So `.env` and `notes.` are all body, and `report.v2.pdf` keeps
 * `report.v2` together.
 */
export const splitFileName = (name: string): MessageFileNameParts => {
    const dot = name.lastIndexOf('.');
    if (dot <= 0 || dot === name.length - 1) return { base: name, extension: '' };
    return { base: name.slice(0, dot), extension: name.slice(dot) };
};

// The server accepts only the OOXML and Hangul formats, but an older or forwarded upload can carry
// the legacy extension of the same family, and it should still look like what it is.
const KIND_BY_EXTENSION: Readonly<Record<string, MessageFileKind>> = {
    pdf: 'pdf',
    doc: 'doc',
    docx: 'doc',
    xls: 'sheet',
    xlsx: 'sheet',
    csv: 'sheet',
    ppt: 'slides',
    pptx: 'slides',
    hwp: 'hangul',
    hwpx: 'hangul',
    txt: 'text',
};

/**
 * The kind a file is drawn as, read from its name's extension, case-insensitively. The extension and
 * not the content type, because the type is the one thing an old upload or a browser pick most often
 * gets wrong (HWP arrives untyped on most systems), and the name is what the user sees beside it.
 */
export const messageFileKind = (name: string | undefined): MessageFileKind => {
    const { extension } = splitFileName(name ?? '');
    return KIND_BY_EXTENSION[extension.slice(1).toLowerCase()] ?? 'file';
};

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

// One decimal, without a trailing ".0" — "1.5 MB", "300 MB".
const oneDecimal = (value: number) => {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

/**
 * A byte count as the card shows it: whole kilobytes below a megabyte, one decimal above.
 *
 * Binary units, because the server's ceilings are (300 MB for a video is 300 × 1024 × 1024 bytes), and
 * a file at the ceiling has to read as exactly the number the refusal toast names. A non-empty file
 * never reads "0 KB" — it rounds up to 1 — since "0 KB" says the file is empty. Undefined when there is
 * no count to show (missing, negative, not a number), so the card leaves the size out instead of
 * printing a wrong one.
 */
export const formatFileSize = (bytes: number | undefined): string | undefined => {
    if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return undefined;
    if (bytes === 0) return '0 KB';
    // Each step is decided on the rounded value, so 1023.6 KB reads "1 MB" rather than "1024 KB".
    const kb = Math.max(1, Math.round(bytes / KB));
    if (kb < 1024) return `${kb} KB`;
    const mb = Math.round((bytes / MB) * 10) / 10;
    if (mb < 1024) return `${oneDecimal(mb)} MB`;
    return `${oneDecimal(bytes / GB)} GB`;
};

/** A download's progress as a ratio the ring can draw, or `undefined` when it is not known. */
export const clampFileProgress = (progress: number | undefined): number | undefined => {
    if (progress === undefined || !Number.isFinite(progress)) return undefined;
    return Math.min(1, Math.max(0, progress));
};
