import { toBlocks, type KnownBlock } from '@chatic/block-kit';

/**
 * The wire shape a channel message carries. Same object the server stores in
 * `blocks$` and the same one `parseBlocks` reads out of `content`, so a payload
 * this tool produces is one a real message can be built from.
 */
export interface BlockKitPayload {
    blocks: KnownBlock[];
}

/**
 * Blocks → the JSON shown in the payload pane.
 *
 * Four-space indent to match what a reader pasting into a webhook body would see
 * from `JSON.stringify(x, null, 4)`, and a trailing newline so the pane's last
 * line is not flush against the edge.
 */
export const blocksToPayloadJson = (blocks: KnownBlock[]): string =>
    `${JSON.stringify({ blocks } satisfies BlockKitPayload, null, 4)}\n`;

/** What went wrong reading a payload back, in the words the pane shows. */
export type PayloadParseResult = { ok: true; blocks: KnownBlock[] } | { ok: false; error: string };

/**
 * The JSON pane → blocks.
 *
 * Reads the array through `toBlocks`, the same door desktop-web's reader uses,
 * so an element the renderer cannot draw comes back as `unknown` and shows its
 * source here instead of being accepted and failing in a channel.
 *
 * Parses once and checks the shape once. `parseBlocks` would do both again and
 * then answer every failure with the same `null`, leaving this function to
 * rediscover the reason it already had.
 *
 * Never throws. An unreadable payload is a message to show, not a crash — the
 * pane keeps the last good blocks and displays the reason.
 */
export const payloadJsonToBlocks = (json: string): PayloadParseResult => {
    const trimmed = json.trim();
    if (!trimmed) return { ok: false, error: 'Payload is empty.' };

    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON.' };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: 'Top level must be an object.' };
    }
    const { blocks } = parsed as { blocks?: unknown };
    // Kept apart from the emptiness check below: a `blocks` that is a string is
    // missing, not empty, and one message for both would say the wrong thing.
    if (!Array.isArray(blocks)) return { ok: false, error: 'Missing a "blocks" array.' };
    if (!blocks.length) return { ok: false, error: '"blocks" is empty.' };

    return { ok: true, blocks: toBlocks(blocks) };
};
