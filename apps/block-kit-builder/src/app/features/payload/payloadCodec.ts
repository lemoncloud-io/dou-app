import { toBlocks, type KnownBlock } from '@chatic/block-kit';

/**
 * The wire shape a channel message carries. Same object the server stores in
 * `blocks$` and the same one `parseBlocks` reads out of `content`, so a payload
 * this tool produces is one a real message can be built from.
 */
interface BlockKitPayload {
    blocks: KnownBlock[];
}

/**
 * Blocks → the JSON shown in the payload pane.
 *
 * Two-space indent: a block's text sits four levels deep, so a wider one spends
 * the pane's whole width on whitespace — on a phone the values were wrapping
 * before they started. A trailing newline so the last line is not flush against
 * the edge.
 */
export const blocksToPayloadJson = (blocks: KnownBlock[]): string =>
    `${JSON.stringify({ blocks } satisfies BlockKitPayload, null, 2)}\n`;

/**
 * What went wrong reading a payload back, in the words the pane shows.
 *
 * `line` only for a failure that has one. A missing `"blocks"` key is wrong
 * about the payload as a whole, and pointing at a line for it would send the
 * reader to look for a mistake that is not there.
 */
export type PayloadParseFailure = { ok: false; error: string; line?: number };
type PayloadParseResult = { ok: true; blocks: KnownBlock[] } | PayloadParseFailure;

/**
 * The line `JSON.parse` blamed, if it named one.
 *
 * V8 ends a syntax error with `at position 118 (line 8 column 3)`; older engines
 * and `Unexpected end of JSON input` carry no position at all. The tail is read
 * off rather than shown, so the pane can put the number in the gutter — beside
 * the line — instead of spelling out a coordinate the reader then has to find.
 */
const LINE_IN_MESSAGE = /\(line (\d+) column \d+\)\s*$/;

const readFailure = (error: unknown): PayloadParseFailure => {
    const message = error instanceof Error ? error.message : 'Invalid JSON.';
    const at = LINE_IN_MESSAGE.exec(message);
    if (!at) return { ok: false, error: message };
    return {
        ok: false,
        error: message
            .slice(0, at.index)
            .replace(/\s*(in JSON)?\s*at position \d+\s*$/, '')
            .trim(),
        line: Number(at[1]),
    };
};

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
    if (!json.trim()) return { ok: false, error: 'Payload is empty.' };

    let parsed: unknown;
    try {
        // The untrimmed string, so the line the failure names is the line the
        // editor is showing. Trimming first would slide every number up by
        // however many blank lines the paste happened to start with.
        parsed = JSON.parse(json);
    } catch (error) {
        return readFailure(error);
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
