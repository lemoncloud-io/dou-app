import type { DomainChat } from '@chatic/data';

import { parseBlocks, toBlocks, type KnownBlock } from '@chatic/block-kit';

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
 * array) → `parseBlocks(content)` → plain text. Every insertion point in
 * `MessageRow` goes through this one function so the priority lives in exactly
 * one place (client contract: knowledge#319 SPEC.md §6-1).
 *
 * The server promises `blocks$` is `undefined` when there is nothing to draw
 * (SPEC §3), but this reads defensively: an empty array falls through to the
 * `content` parse instead of rendering an empty bubble.
 */
export const resolveChatBlocks = (chat: DomainChat): ResolvedChatBlocks => {
    // `ChatModel.blocks$` is declared server-side (SPEC.md §2) but the published
    // `@lemoncloud/chatic-socials-api` types have not caught up yet — same
    // situation as `join.metaNo` (see `channelUnread.ts`).
    const field = (chat as { blocks$?: unknown }).blocks$;
    if (Array.isArray(field) && field.length) {
        return { blocks: toBlocks(field), source: 'field' };
    }
    const blocks = parseBlocks(chat.content);
    return { blocks, source: blocks ? 'content' : null };
};
