import { chatAttachmentExtension, chatAttachmentFormat } from '@chatic/runtime-react';

import type { ChatFile } from './chatImages';

export type FilePreview = 'pdf' | 'text' | 'html' | 'audio';

const PREVIEWS: Readonly<Record<string, FilePreview>> = {
    'application/pdf': 'pdf',
    'text/plain': 'text',
    'text/csv': 'text',
    'text/markdown': 'text',
    'application/json': 'text',
    'text/html': 'html',
    'audio/mp4': 'audio',
    'audio/mpeg': 'audio',
    'audio/wav': 'audio',
    'audio/ogg': 'audio',
};

export const VOICE_EXTENSIONS: readonly string[] = Object.keys(PREVIEWS)
    .filter(type => PREVIEWS[type] === 'audio')
    .map(type => chatAttachmentExtension(type))
    .filter((extension): extension is string => !!extension);

export const canPreview = (file: ChatFile): FilePreview | null => {
    if (file.kind !== 'file' || !file.url || file.isUploading || file.isFailed) return null;
    return previewOf(file);
};

const previewOf = (file: ChatFile): FilePreview | null => {
    const format = chatAttachmentFormat({ name: file.name ?? '', type: file.contentType ?? '' });
    return (format && PREVIEWS[format.type]) ?? null;
};

export const isVoiceFile = (file: ChatFile): boolean => file.kind === 'file' && previewOf(file) === 'audio';

export const splitFileName = (name: string): { stem: string; extension: string } => {
    const dot = name.lastIndexOf('.');
    return dot > 0 && dot < name.length - 1
        ? { stem: name.slice(0, dot), extension: name.slice(dot) }
        : { stem: name, extension: '' };
};

export const formatPlaybackTime = (seconds: number): string => {
    const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = String(total % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
};

export const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;

export const HTML_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

const HTML_PREVIEW_POLICY =
    "default-src 'none'; style-src 'unsafe-inline' data:; img-src data:; font-src data:; media-src data:; form-action 'none'";

const HTML_PREVIEW_HEAD =
    `<meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_POLICY}">` +
    '<meta name="referrer" content="no-referrer"><base target="_blank">';

export const htmlPreviewDocument = (html: string): string => {
    const page = new DOMParser().parseFromString(html.replace(/^\uFEFF/, ''), 'text/html');
    page.head.insertAdjacentHTML('afterbegin', HTML_PREVIEW_HEAD);
    const doctype = page.doctype ? new XMLSerializer().serializeToString(page.doctype) : '';
    return `${doctype}${page.documentElement.outerHTML}`;
};

export const readTextPreview = async (
    blob: Blob,
    fileSize?: number,
    maxBytes: number = TEXT_PREVIEW_MAX_BYTES
): Promise<{ text: string; truncated: boolean }> => {
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
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: truncated }), truncated };
    } catch {
        return { text: new TextDecoder('euc-kr').decode(bytes, { stream: truncated }), truncated };
    }
};
