import { toBlocks, type KnownBlock } from '@chatic/block-kit';

interface BlockKitPayload {
    blocks: KnownBlock[];
}

export const blocksToPayloadJson = (blocks: KnownBlock[]): string =>
    `${JSON.stringify({ blocks } satisfies BlockKitPayload, null, 2)}\n`;

export type PayloadParseFailure = { ok: false; error: string; line?: number };
type PayloadParseResult = { ok: true; blocks: KnownBlock[] } | PayloadParseFailure;

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

export const payloadJsonToBlocks = (json: string): PayloadParseResult => {
    if (!json.trim()) return { ok: false, error: 'Payload is empty.' };

    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch (error) {
        return readFailure(error);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: 'Top level must be an object.' };
    }
    const { blocks } = parsed as { blocks?: unknown };
    if (!Array.isArray(blocks)) return { ok: false, error: 'Missing a "blocks" array.' };
    if (!blocks.length) return { ok: false, error: '"blocks" is empty.' };

    return { ok: true, blocks: toBlocks(blocks) };
};
