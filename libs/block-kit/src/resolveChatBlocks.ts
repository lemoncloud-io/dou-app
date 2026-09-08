import { parseBlocks, toBlocks, type KnownBlock } from './blockKit';

/**
 * Which read path produced the blocks. `field` means `content` is already the
 * server's own plain-text summary (SPEC §6-5, knowledge#319
 * projects/@lemoncloud-io/chatic-socials-api/webhook-message-blocks/SPEC.md) —
 * callers that need a display string must not fold the blocks back into text
 * in that case, or they discard the summary the server promised. `content`
 * means the blocks *are* what `content` parsed into.
 */
type ChatBlocksSource = 'field' | 'content';

interface ResolvedChatBlocks {
    blocks: KnownBlock[] | null;
    source: ChatBlocksSource | null;
}

/**
 * Read priority for a chat's Block Kit content: `chat.blocks$` (non-empty
 * array) → `parseBlocks(content)` → plain text. Every insertion point goes
 * through this one function so the priority lives in exactly one place (client
 * contract: knowledge#319 SPEC.md §6-1).
 *
 * The server promises `blocks$` is `undefined` when there is nothing to draw
 * (SPEC §3), but this reads defensively: an empty array falls through to the
 * `content` parse instead of rendering an empty bubble.
 *
 * The parameter is structural rather than `DomainChat` on purpose: this lib
 * draws Block Kit and knows nothing else, so taking the domain model would put
 * `@chatic/data` in its dependency list to read two fields. `DomainChat` (and
 * any view extending it) satisfies this shape.
 *
 * `blocks$` is declared server-side (SPEC.md §2) but the published
 * `@lemoncloud/chatic-socials-api` types have not caught up — same situation as
 * `join.metaNo` (see desktop-web's `channelUnread.ts`). Declaring it here as
 * `unknown` is what lets callers pass a `DomainChat` that has no such field.
 */
export const resolveChatBlocks = (chat: { content?: string; blocks$?: unknown }): ResolvedChatBlocks => {
    const field = chat.blocks$;
    if (Array.isArray(field) && field.length) {
        return { blocks: toBlocks(field), source: 'field' };
    }
    const blocks = parseBlocks(chat.content);
    return { blocks, source: blocks ? 'content' : null };
};
