export type MessageFileKind = 'pdf' | 'doc' | 'sheet' | 'slides' | 'hangul' | 'text' | 'file';

export interface MessageFileNameParts {
    base: string;
    extension: string;
}

export const splitFileName = (name: string): MessageFileNameParts => {
    const dot = name.lastIndexOf('.');
    if (dot <= 0 || dot === name.length - 1) return { base: name, extension: '' };
    return { base: name.slice(0, dot), extension: name.slice(dot) };
};

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

export const messageFileKind = (name: string | undefined): MessageFileKind => {
    const { extension } = splitFileName(name ?? '');
    return KIND_BY_EXTENSION[extension.slice(1).toLowerCase()] ?? 'file';
};

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

const oneDecimal = (value: number) => {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

export const formatFileSize = (bytes: number | undefined): string | undefined => {
    if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return undefined;
    if (bytes === 0) return '0 KB';
    const kb = Math.max(1, Math.round(bytes / KB));
    if (kb < 1024) return `${kb} KB`;
    const mb = Math.round((bytes / MB) * 10) / 10;
    if (mb < 1024) return `${oneDecimal(mb)} MB`;
    return `${oneDecimal(bytes / GB)} GB`;
};

export const clampFileProgress = (progress: number | undefined): number | undefined => {
    if (progress === undefined || !Number.isFinite(progress)) return undefined;
    return Math.min(1, Math.max(0, progress));
};
