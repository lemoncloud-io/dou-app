import { describe, expect, it } from 'vitest';

import { blocksToPayloadJson, payloadJsonToBlocks } from '../payload';
import { TEMPLATES } from './templates';

const template = (id: string) => {
    const found = TEMPLATES.find(candidate => candidate.id === id);
    if (!found) throw new Error(`no template ${id}`);
    return found;
};

describe('TEMPLATES', () => {
    it.each(TEMPLATES.map(entry => [entry.id] as const))('draws %s with no unsupported block', id => {
        expect(template(id).blocks.some(block => block.type === 'unknown')).toBe(false);
    });

    it.each(TEMPLATES.map(entry => [entry.id] as const))('round-trips %s through the payload pane', id => {
        const blocks = template(id).blocks;
        expect(payloadJsonToBlocks(blocksToPayloadJson(blocks))).toEqual({ ok: true, blocks });
    });
});
