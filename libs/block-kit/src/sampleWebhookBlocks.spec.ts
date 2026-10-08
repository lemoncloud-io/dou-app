import { describe, expect, it } from 'vitest';

import { WEBHOOK_BLOCKS_ERROR_REPORT } from './sampleWebhookBlocks';
import { toBlocks } from './blockKit';

describe('the webhook sample', () => {
    // The reader has to be able to draw every block a webhook message carries — an `unknown`
    // here would mean the client's supported set had fallen behind the sample.
    it('draws every block the sample carries', () => {
        expect(toBlocks(WEBHOOK_BLOCKS_ERROR_REPORT).some(block => block.type === 'unknown')).toBe(false);
    });
});
