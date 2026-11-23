import { describe, expect, it } from 'vitest';

import { WEBHOOK_BLOCKS_ERROR_REPORT, WEBHOOK_SEND_ERROR_REPORT } from './sampleWebhookBlocks';
import { resolveChatBlocks } from './resolveChatBlocks';

interface ChatFields {
    content?: string;
    blocks$?: unknown[];
    stereo?: string;
}

const chat = (fields: ChatFields) => ({ id: 'C1:1', channelId: 'C1', chatNo: 1, stereo: 'webhook', ...fields });

describe('resolveChatBlocks', () => {
    it('reads the server fixture from blocks$ — header 1, section 2, context 1', () => {
        const result = resolveChatBlocks(
            chat({
                content: WEBHOOK_SEND_ERROR_REPORT.content,
                blocks$: [...WEBHOOK_BLOCKS_ERROR_REPORT],
            })
        );
        expect(result.source).toBe('field');
        expect(result.blocks?.map(b => b.type)).toEqual(['header', 'section', 'section', 'context']);
        expect(result.blocks?.[0]).toEqual(WEBHOOK_BLOCKS_ERROR_REPORT[0]);
    });

    it('falls back to parseBlocks(content) when blocks$ is absent', () => {
        const result = resolveChatBlocks(chat({ content: JSON.stringify({ blocks: [{ type: 'divider' }] }) }));
        expect(result.source).toBe('content');
        expect(result.blocks).toEqual([{ type: 'divider' }]);
    });

    it('treats an empty blocks$ array as absent, not as an empty bubble', () => {
        const result = resolveChatBlocks(
            chat({ content: JSON.stringify({ blocks: [{ type: 'divider' }] }), blocks$: [] })
        );
        expect(result.source).toBe('content');
        expect(result.blocks).toEqual([{ type: 'divider' }]);
    });

    it('is plain text when neither blocks$ nor a parseable content is present', () => {
        const result = resolveChatBlocks(chat({ content: 'hello there' }));
        expect(result.source).toBeNull();
        expect(result.blocks).toBeNull();
    });

    it.each(['user', 'system', undefined])('reads no blocks from a %s message', stereo => {
        const result = resolveChatBlocks(
            chat({
                stereo,
                content: JSON.stringify({ blocks: [{ type: 'divider' }] }),
                blocks$: [{ type: 'divider' }],
            })
        );
        expect(result).toEqual({ blocks: null, source: null });
    });

    it('downgrades an unsupported element inside blocks$ instead of crashing', () => {
        const result = resolveChatBlocks(
            chat({
                content: 'fallback text',
                blocks$: [{ type: 'divider' }, { type: 'actions', elements: [{ type: 'button' }] }],
            })
        );
        expect(result.source).toBe('field');
        expect(result.blocks).toEqual([
            { type: 'divider' },
            { type: 'unknown', raw: '{"type":"actions","elements":[{"type":"button"}]}' },
        ]);
    });
});
