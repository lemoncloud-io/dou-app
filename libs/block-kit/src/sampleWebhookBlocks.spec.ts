import { describe, expect, it } from 'vitest';

import {
    WEBHOOK_BLOCKS_ATTENDANCE,
    WEBHOOK_BLOCKS_DEPLOYMENT,
    WEBHOOK_BLOCKS_ERROR_REPORT,
    WEBHOOK_SEND_ATTENDANCE,
    WEBHOOK_SEND_DEPLOYMENT,
    WEBHOOK_SEND_ERROR_REPORT,
    WEBHOOK_SOURCE_ATTENDANCE,
    WEBHOOK_SOURCE_DEPLOYMENT,
    WEBHOOK_SOURCE_ERROR_REPORT,
} from './sampleWebhookBlocks';
import { toBlocks } from './blockKit';

const SAMPLES = [
    ['error report', WEBHOOK_SEND_ERROR_REPORT, WEBHOOK_BLOCKS_ERROR_REPORT, WEBHOOK_SOURCE_ERROR_REPORT],
    ['deployment', WEBHOOK_SEND_DEPLOYMENT, WEBHOOK_BLOCKS_DEPLOYMENT, WEBHOOK_SOURCE_DEPLOYMENT],
    ['attendance', WEBHOOK_SEND_ATTENDANCE, WEBHOOK_BLOCKS_ATTENDANCE, WEBHOOK_SOURCE_ATTENDANCE],
] as const;

describe('the webhook samples', () => {
    it.each(SAMPLES)('draws every block the %s sample carries', (_, __, blocks) => {
        expect(toBlocks(blocks).some(block => block.type === 'unknown')).toBe(false);
    });

    it.each(SAMPLES)("keeps the %s sample's source$ in step with its send body", (_, send, __, source) => {
        const meta = send.meta as { color?: string; sourceUrl?: string; channel?: string };
        expect(source).toEqual(
            Object.fromEntries(
                Object.entries({ key: meta.channel, url: meta.sourceUrl, color: meta.color }).filter(
                    ([, value]) => value !== undefined
                )
            )
        );
    });
});
