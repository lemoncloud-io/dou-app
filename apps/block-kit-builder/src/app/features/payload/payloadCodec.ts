import { parseBlocks, type KnownBlock } from '@chatic/block-kit';

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
 * Goes through `parseBlocks` rather than `JSON.parse` alone so the builder reads
 * a payload exactly the way desktop-web does: an element the renderer cannot
 * draw comes back as `unknown` and shows its source, instead of being accepted
 * here and failing in a channel.
 *
 * Never throws. An unreadable payload is a message to show, not a crash — the
 * pane keeps the last good blocks and displays the reason.
 */
export const payloadJsonToBlocks = (json: string): PayloadParseResult => {
    const trimmed = json.trim();
    if (!trimmed) return { ok: false, error: 'Payload is empty.' };
    const blocks = parseBlocks(trimmed);
    if (blocks) return { ok: true, blocks };

    // `parseBlocks` answers with one `null` for every failure, so say which.
    try {
        const parsed: unknown = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { ok: false, error: 'Top level must be an object.' };
        }
        const { blocks: raw } = parsed as { blocks?: unknown };
        if (!Array.isArray(raw)) return { ok: false, error: 'Missing a "blocks" array.' };
        return { ok: false, error: '"blocks" is empty.' };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON.' };
    }
};
