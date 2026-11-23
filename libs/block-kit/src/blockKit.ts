export interface BlockTextObject {
    type: 'mrkdwn' | 'plain_text';
    text: string;
}

export interface SectionBlock {
    type: 'section';
    text?: BlockTextObject;
    fields?: BlockTextObject[];
}

export interface HeaderBlock {
    type: 'header';
    text: BlockTextObject;
    level?: number;
}

export interface DividerBlock {
    type: 'divider';
}

export interface ContextBlock {
    type: 'context';
    elements: BlockTextObject[];
}

export interface UnknownBlock {
    type: 'unknown';
    raw: string;
}

export type KnownBlock = SectionBlock | HeaderBlock | DividerBlock | ContextBlock | UnknownBlock;

export const hasDrawableBlocks = (blocks: KnownBlock[]): boolean => blocks.some(block => block.type !== 'unknown');

export const decodeSlackEntities = (text: string): string =>
    text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export const SLACK_MARKS = ['\\*', '_', '~'] as const;

export const markPattern = (mark: string): string => `(^|[^\\w${mark}])${mark}([^${mark}\\n]+)${mark}(?![\\w${mark}])`;

const asText = (value: unknown): BlockTextObject | null => {
    if (!value || typeof value !== 'object') return null;
    const { type, text } = value as { type?: unknown; text?: unknown };
    if (typeof text !== 'string') return null;
    return { type: type === 'plain_text' ? 'plain_text' : 'mrkdwn', text };
};

const asTexts = (value: unknown): BlockTextObject[] =>
    Array.isArray(value) ? value.map(asText).filter((t): t is BlockTextObject => t !== null) : [];

const toBlock = (element: unknown): KnownBlock => {
    const unknown: UnknownBlock = { type: 'unknown', raw: JSON.stringify(element) };
    if (!element || typeof element !== 'object' || Array.isArray(element)) return unknown;
    const raw = element as Record<string, unknown>;
    switch (raw.type) {
        case 'divider':
            return { type: 'divider' };
        case 'header': {
            const text = asText(raw.text);
            if (!text) return unknown;
            const level = typeof raw.level === 'number' ? raw.level : undefined;
            return { type: 'header', text, level };
        }
        case 'section': {
            const text = asText(raw.text) ?? undefined;
            const fields = asTexts(raw.fields);
            if (!text && !fields.length) return unknown;
            return { type: 'section', text, fields: fields.length ? fields : undefined };
        }
        case 'context': {
            const elements = asTexts(raw.elements);
            if (!elements.length) return unknown;
            return { type: 'context', elements };
        }
        default:
            return unknown;
    }
};

export const toBlocks = (elements: unknown[]): KnownBlock[] => elements.map(toBlock);

export const parseBlocks = (content?: string): KnownBlock[] | null => {
    if (!content) return null;
    const trimmed = content.trim();
    if (!trimmed.startsWith('{')) return null;
    let payload: unknown;
    try {
        payload = JSON.parse(trimmed);
    } catch {
        return null;
    }
    if (!payload || typeof payload !== 'object') return null;
    const { blocks } = payload as { blocks?: unknown };
    if (!Array.isArray(blocks) || !blocks.length) return null;
    return toBlocks(blocks);
};
