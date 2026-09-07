import { describe, expect, it } from 'vitest';

import { WEBHOOK_SEND_ERROR_REPORT } from '@chatic/block-kit';
import { messagePlainText } from './messagePlainText';

describe('messagePlainText', () => {
    it('strips the composer dialect from an ordinary message', () => {
        expect(messagePlainText('**ship** it')).toBe('ship it');
    });

    it('flattens a Block Kit payload instead of printing it', () => {
        const payload = JSON.stringify({
            blocks: [
                { type: 'header', text: { type: 'plain_text', text: 'Error report' } },
                { type: 'section', text: { type: 'mrkdwn', text: '*403* denied by policy' } },
            ],
        });
        expect(messagePlainText(payload)).toBe('Error report\n403 denied by policy');
    });

    it('shows a broken payload as the text it already was', () => {
        expect(messagePlainText('{"blocks": [')).toBe('{"blocks": [');
    });

    it('is empty for no message at all', () => {
        expect(messagePlainText(undefined)).toBe('');
    });

    // Pins plan D2 (no `blocks$` parameter added here): a `blocks$` message's
    // `content` is the server's own plain-text summary, not JSON (SPEC §6-5,
    // knowledge#319 SPEC.md) — it does not start with `{`, so `parseBlocks` falls
    // through to `stripMarkdown` and this already reads correctly with the
    // one-argument signature. The six call sites (sidebar preview, OS
    // notification, search, mention capture) stay untouched for the same reason.
    it('reads a webhook summary as plain text — content is already a summary, not a payload', () => {
        expect(messagePlainText(WEBHOOK_SEND_ERROR_REPORT.content)).toBe(
            "error-report: chatic-sockets-api/lemon-production#0.26.710\nTypeError: Cannot read properties of undefined (reading 'channelId')"
        );
    });
});
