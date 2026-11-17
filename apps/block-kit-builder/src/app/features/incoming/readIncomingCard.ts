import { toBlocks, type KnownBlock } from '@chatic/block-kit';

import type { PreviewSource } from '../preview';

/**
 * A card a sender linked here from its own `원문 보기`: `?template=<builder id>#card=<base64url JSON>`.
 *
 * The card is the `meta` the sender posts to the channel webhook — an attachment, not Block Kit — so
 * it is laid out the way the channel server lays it out: title as the header, body as a section,
 * fields as a two-column section (`*title*` over the value), footer as the context line. It rides in the fragment, which the browser never sends to this site's host.
 */
export interface IncomingCard {
    /** The sender's builder id, e.g. `lemoment.leave`. */
    templateId: string;
    blocks: KnownBlock[];
    source: PreviewSource;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** `meta.fields` → section field texts; cells without a value are dropped. */
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

/** Never throws: a link that does not carry a readable card is `null`, and the builder opens as usual. */
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
