import type { KnownBlock } from './blockKit';

/**
 * Only `http`/`https` become the heading's link. The source is webhook input the
 * server stores without reading it, and a caller hands this link to the OS
 * browser — a `javascript:` or `data:` value must not reach either.
 */
export const isWebUrl = (url?: string): url is string => {
    if (!url?.trim()) return false;
    try {
        const { protocol } = new URL(url.trim());
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
};

/**
 * The link the server appends to a webhook card when the sender gave a source
 * (`meta.sourceUrl`, the full report): the last element of the last `context`
 * block, written `<url|원문 보기>` — the server's own fixed label.
 *
 * The label is how the link is found, not a trust boundary: Block Kit JSON sent
 * as a message's `content` can end with the same text. Moving it is still safe
 * because it never adds a link — it moves an `http(s)` one the card already
 * showed, from the last line to the title.
 */
const SERVER_SOURCE_LINK = /^<([^<>|]+)\|원문 보기>$/;

/**
 * The heading that can carry the source link: the first one, and only when it is
 * `plain_text`. A mrkdwn heading can hold links or a fenced run of its own, and an
 * interactive element inside the link would open the source as well as itself.
 */
export const linkableHeaderIndex = (blocks: KnownBlock[]): number => {
    const at = blocks.findIndex(block => block.type === 'header');
    const header = blocks[at];
    return header?.type === 'header' && header.text.type === 'plain_text' ? at : -1;
};

interface SourceLink {
    /** The blocks to draw, without the context link when it was taken. */
    blocks: KnownBlock[];
    /** Where the whole message can be read, for `BlockKitMessage`'s `sourceUrl`. */
    sourceUrl?: string;
}

/**
 * Moves the server's source link from the card's last line up to its heading.
 *
 * The design puts the way to the full report beside the title — the first thing
 * a reader looks at, and the thing they want more of — rather than as a small
 * link under everything else. Left where it is as well, the card would offer the
 * same link twice.
 *
 * Takes it only when there is a plain-text heading to carry it and the address
 * is a web one; otherwise the blocks come back unchanged and the link stays reachable
 * where the server put it. A context block emptied by the move is dropped.
 */
export const takeSourceLink = (blocks: KnownBlock[]): SourceLink => {
    if (linkableHeaderIndex(blocks) < 0) return { blocks };
    const at = blocks.map(block => block.type).lastIndexOf('context');
    const context = blocks[at];
    if (context?.type !== 'context') return { blocks };
    const last = context.elements[context.elements.length - 1];
    const match = last?.type === 'mrkdwn' ? SERVER_SOURCE_LINK.exec(last.text.trim()) : null;
    if (!match || !isWebUrl(match[1])) return { blocks };

    const elements = context.elements.slice(0, -1);
    const rest = elements.length ? [{ ...context, elements }] : [];
    return { blocks: [...blocks.slice(0, at), ...rest, ...blocks.slice(at + 1)], sourceUrl: match[1].trim() };
};
