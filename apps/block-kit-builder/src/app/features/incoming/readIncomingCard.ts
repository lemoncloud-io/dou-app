import { toBlocks, type KnownBlock } from '@chatic/block-kit';

import type { PreviewSource } from '../preview';

export interface IncomingCard {
    templateId: string;
    blocks: KnownBlock[];
    source: PreviewSource;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const fieldTexts = (value: unknown): { type: 'mrkdwn'; text: string }[] =>
    (Array.isArray(value) ? value : []).flatMap(field => {
        const cell = (field ?? {}) as Record<string, unknown>;
        const fieldValue = typeof cell.value === 'number' ? String(cell.value) : str(cell.value);
        if (!fieldValue) return [];
        const title = str(cell.title);
        return [{ type: 'mrkdwn' as const, text: title ? `*${title}*\n${fieldValue}` : fieldValue }];
    });

const fromBase64Url = (value: string): string => {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
};

export const readIncomingCard = (search: string, hash: string): IncomingCard | null => {
    const templateId = new URLSearchParams(search).get('template')?.trim();
    const encoded = new URLSearchParams(hash.replace(/^#/, '')).get('card');
    if (!templateId || !encoded) return null;

    let meta: Record<string, unknown>;
    try {
        meta = JSON.parse(fromBase64Url(encoded)) as Record<string, unknown>;
    } catch {
        return null;
    }
    if (!meta || typeof meta !== 'object') return null;

    const title = str(meta.title);
    const text = str(meta.text);
    const footer = str(meta.footer);
    const fields = fieldTexts(meta.fields);
    if (!title && !text) return null;

    const blocks = toBlocks([
        ...(title ? [{ type: 'header', text: { type: 'plain_text', text: title } }] : []),
        ...(text ? [{ type: 'section', text: { type: 'mrkdwn', text } }] : []),
        ...(fields.length ? [{ type: 'section', fields }] : []),
        ...(footer ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: footer }] }] : []),
    ]);
    return { templateId, blocks, source: { key: str(meta.channel), color: str(meta.color), url: '' } };
};
