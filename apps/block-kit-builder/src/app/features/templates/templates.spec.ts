import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { blocksToPayloadJson, payloadJsonToBlocks } from '../payload';
import { TEMPLATES } from './templates';

const template = (id: string) => {
    const found = TEMPLATES.find(candidate => candidate.id === id);
    if (!found) throw new Error(`no template ${id}`);
    return found;
};

describe('TEMPLATES', () => {
    /**
     * The Error template is a copy of the server's own sample, so it is only worth
     * having if it stays a copy. Fetching the source of truth rather than a second
     * local copy is the point — a fixture checked in beside it would drift together
     * with the template and agree about being wrong.
     *
     * Skipped without network or `gh`; a copy that cannot be checked is still a
     * copy, and failing the suite on someone's offline laptop would say otherwise.
     */
    it('matches the server sample it was copied from', () => {
        let sample: string;
        try {
            sample = execFileSync(
                'gh',
                [
                    'api',
                    'repos/lemoncloud-io/chatic-socials-api/contents/sample/chats/webhook-blocks-error-report.json?ref=feat/webhook-message-blocks',
                    '--jq',
                    '.content',
                ],
                { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
            );
        } catch {
            return;
        }
        const expected: unknown = JSON.parse(Buffer.from(sample, 'base64').toString('utf8'));
        expect(template('error').blocks).toEqual(expected);
    });

    it.each(TEMPLATES.map(entry => [entry.id] as const))('draws %s with no unsupported block', id => {
        expect(template(id).blocks.some(block => block.type === 'unknown')).toBe(false);
    });

    // A template is a starting point for editing, so it has to survive the trip
    // through the payload pane the reader will inevitably make.
    it.each(TEMPLATES.map(entry => [entry.id] as const))('round-trips %s through the payload pane', id => {
        const blocks = template(id).blocks;
        expect(payloadJsonToBlocks(blocksToPayloadJson(blocks))).toEqual({ ok: true, blocks });
    });
});
