import type { KnownBlock } from './blockKit';

/**
 * Only `http`/`https` become the card's source link. The source is webhook input the
 * server stores without reading it, and a caller hands this link to the OS
 * browser — a `javascript:` or `data:` value must not reach either.
 */
export const isWebUrl = (url?: unknown): url is string => {
    if (typeof url !== 'string' || !url.trim()) return false;
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
 * showed.
 */
const SERVER_SOURCE_LINK = /^<([^<>|]+)\|원문 보기>$/;

/** What `takeSourceLink` reads off the message itself — the shape of the server's `source$`. */
export interface SourceLinkInput {
    url?: unknown;
}

interface SourceLink {
    /** The blocks to draw, without the server's source line when it was taken. */
    blocks: KnownBlock[];
    /** Where the whole message can be read, for `BlockKitMessage`'s `sourceUrl`. */
    sourceUrl?: string;
}

/**
 * Finds the card's source link, and takes the server's `원문 보기` element off the
 * last line so the card does not offer it twice.
 *
 * Read in order: the message's own `source$.url`, then the server's context
 * element. The field is the server's record of the source and does not depend on
 * the label's wording; the context element is all a message stored before the
 * field existed has. Both come from the same `meta.sourceUrl` on the server, so
 * when both are there they agree — and if they ever did not, the field wins and
 * the line still goes.
 *
 * `BlockKitMessage` draws the link as its own labelled line at the foot of the card. When
 * neither gives a web address the blocks come back unchanged, so whatever the
 * server put on the last line stays where it can still be pressed — or, for a
 * `javascript:` one, stays inert text-shaped markup the renderer never links.
 * A context block emptied by the move is dropped.
 */
export const takeSourceLink = (blocks: KnownBlock[], source?: SourceLinkInput | null): SourceLink => {
    const field = isWebUrl(source?.url) ? source.url.trim() : undefined;

    const at = blocks.map(block => block.type).lastIndexOf('context');
    const context = blocks[at];
    const last = context?.type === 'context' ? context.elements[context.elements.length - 1] : undefined;
    const match = last?.type === 'mrkdwn' ? SERVER_SOURCE_LINK.exec(last.text.trim()) : null;
    const lineUrl = match && isWebUrl(match[1]) ? match[1].trim() : undefined;

    const sourceUrl = field ?? lineUrl;
    if (!sourceUrl) return { blocks };
    if (!match || context?.type !== 'context') return { blocks, sourceUrl };

    const elements = context.elements.slice(0, -1);
    const rest = elements.length ? [{ ...context, elements }] : [];
    return { blocks: [...blocks.slice(0, at), ...rest, ...blocks.slice(at + 1)], sourceUrl };
};
