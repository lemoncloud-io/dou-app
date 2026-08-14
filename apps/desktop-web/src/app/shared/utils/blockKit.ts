/**
 * The slice of Slack's Block Kit this client draws, plus the defensive reader
 * that turns a message body into it.
 *
 * The server sends structured messages as a Block Kit payload; nothing here is
 * produced locally. What we cannot draw we keep verbatim as an `unknown` block,
 * so a message never renders as an empty bubble.
 */

/** Slack composition object — `plain_text` renders literally, `mrkdwn` goes through the parser. */
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
    /** 1–4 → H1–H4. Absent means H1. */
    level?: number;
}

export interface DividerBlock {
    type: 'divider';
}

export interface ContextBlock {
    type: 'context';
    elements: BlockTextObject[];
}

/** A block we do not draw — its source is carried so the reader still sees it. */
export interface UnknownBlock {
    type: 'unknown';
    raw: string;
}

export type KnownBlock = SectionBlock | HeaderBlock | DividerBlock | ContextBlock | UnknownBlock;

/** Slack escapes exactly these three on the wire. */
export const decodeSlackEntities = (text: string): string =>
    text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** The three inline marks Slack's mrkdwn defines, as regex-safe literals. */
export const SLACK_MARKS = ['\\*', '_', '~'] as const;

/**
 * What counts as a mark, as a pattern source both readers build on — the renderer
 * folds these into one alternation, the flattener compiles one each.
 *
 * A mark only counts when its delimiters stand alone, which is what keeps
 * `user_id` whole and leaves the composer's `**x**` literal instead of reading it
 * as an italic in stray asterisks. Captures the character in front of the mark
 * (group 1) so the caller can put it back, and the content between the
 * delimiters (group 2).
 */
export const markPattern = (mark: string): string => `(^|[^\\w${mark}])${mark}([^${mark}\\n]+)${mark}(?![\\w${mark}])`;

const asText = (value: unknown): BlockTextObject | null => {
    if (!value || typeof value !== 'object') return null;
    const { type, text } = value as { type?: unknown; text?: unknown };
    if (typeof text !== 'string') return null;
    return { type: type === 'plain_text' ? 'plain_text' : 'mrkdwn', text };
};

const asTexts = (value: unknown): BlockTextObject[] =>
    Array.isArray(value) ? value.map(asText).filter((t): t is BlockTextObject => t !== null) : [];

/**
 * One wire element → one block. A supported `type` missing the field it needs to
 * render is downgraded to `unknown` rather than drawn empty, which is the same
 * rule as an unsupported type: show the source, never nothing.
 */
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

/**
 * Is this message body a Block Kit payload? Decided by content alone.
 *
 * The `contentType` marker is deliberately not consulted: its value is not
 * settled server-side, `toDomainChat` passes through whatever arrives, and this
 * client's own send path stamps `'text'` by default — so trusting the marker
 * risks answering "no" to every message and leaving the feature dead while every
 * test stays green. The opening-brace check is the cheap guard instead.
 *
 * Never throws: every failure is `null`, which callers read as "plain text,
 * render it the way we always did".
 */
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
    return blocks.map(toBlock);
};
