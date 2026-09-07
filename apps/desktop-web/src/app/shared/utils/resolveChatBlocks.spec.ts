import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/data';

import { WEBHOOK_BLOCKS_ERROR_REPORT, WEBHOOK_SEND_ERROR_REPORT } from '@chatic/block-kit';
import { resolveChatBlocks } from './resolveChatBlocks';

// The fields this derivation reads. `blocks$` is re-declared as its wire shape
// (the published `@lemoncloud/chatic-socials-api` package doesn't have it yet —
// same reason `channelUnread.spec.ts` re-declares `$join`'s `metaNo`): a typo
// here fails to compile instead of silently testing nothing.
interface ChatFields {
    content?: string;
    blocks$?: unknown[];
}

const chat = (fields: ChatFields): DomainChat => ({ id: 'C1:1', channelId: 'C1', chatNo: 1, ...fields }) as DomainChat;

describe('resolveChatBlocks', () => {
    // Tracer bullet: the server fixture is the client contract (knowledge#319
    // SPEC.md §6-9) — header 1 + section 2 + context 1, read from `blocks$`.
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

    // SPEC §6-1: blocks$ missing falls back to the existing content-JSON check.
    it('falls back to parseBlocks(content) when blocks$ is absent', () => {
        const result = resolveChatBlocks(chat({ content: JSON.stringify({ blocks: [{ type: 'divider' }] }) }));
        expect(result.source).toBe('content');
        expect(result.blocks).toEqual([{ type: 'divider' }]);
    });

    // Server promises blocks$ is undefined when there is nothing to draw
    // (SPEC §3), but the reader does not trust that — an empty array must not
    // render an empty bubble, it must fall through exactly like "absent".
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

    // blocks$ elements must go through toBlock individually — a type the client
    // does not know must downgrade to `unknown`, not throw or vanish.
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
