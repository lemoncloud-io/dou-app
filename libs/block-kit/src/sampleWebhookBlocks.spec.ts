import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { WEBHOOK_BLOCKS_ERROR_REPORT, WEBHOOK_SEND_ERROR_REPORT } from './sampleWebhookBlocks';
import { toBlocks } from './blockKit';

const fetchSample = (file: string): unknown => {
    const encoded = execFileSync(
        'gh',
        [
            'api',
            `repos/lemoncloud-io/chatic-socials-api/contents/sample/chats/${file}?ref=feat/webhook-message-blocks`,
            '--jq',
            '.content',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
};

const canReachGithub = (() => {
    try {
        execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
})();

describe('the server sample', () => {
    // Declared with skipIf rather than an early `return`, so a run without `gh`
    // reports the check as skipped instead of passing. A green tick that proved
    // nothing is worse than no tick.
    it.skipIf(!canReachGithub)('still matches what the server stores', () => {
        expect(WEBHOOK_BLOCKS_ERROR_REPORT).toEqual(fetchSample('webhook-blocks-error-report.json'));
        expect(WEBHOOK_SEND_ERROR_REPORT).toEqual(fetchSample('webhook-send-error-report.json'));
    });

    // Whatever the server sends, this reader has to be able to draw it — an
    // `unknown` here would mean the client's supported set had fallen behind.
    it('draws every block the sample carries', () => {
        expect(toBlocks(WEBHOOK_BLOCKS_ERROR_REPORT).some(block => block.type === 'unknown')).toBe(false);
    });
});
