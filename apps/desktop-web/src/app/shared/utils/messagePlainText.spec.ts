import { describe, expect, it } from 'vitest';

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
});
