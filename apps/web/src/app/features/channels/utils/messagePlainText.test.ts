import { messagePlainText } from './messagePlainText';
import { toPlainPreview } from './messageTokens';

describe('messagePlainText', () => {
    it('flattens a Block Kit payload instead of returning its JSON', () => {
        const content = JSON.stringify({
            blocks: [
                { type: 'header', text: { type: 'plain_text', text: '배포 실패' } },
                { type: 'section', text: { type: 'mrkdwn', text: '*503* upstream timeout' } },
            ],
        });

        const plain = messagePlainText(content);

        expect(plain).toContain('배포 실패');
        expect(plain).toContain('503 upstream timeout');
        expect(plain).not.toContain('{');
    });

    it('leaves an ordinary message untouched — markup included', () => {
        expect(messagePlainText('배포는 `yarn deploy` 로')).toBe('배포는 `yarn deploy` 로');
    });

    // The `blocks$` read path: the server puts its own plain-text summary in `content`
    // (SPEC §6-5), and folding the blocks back into text there would throw that summary away.
    // A summary is not JSON, so it falls through — this pins that it is not mangled.
    it('passes the server summary through on the blocks$ path', () => {
        expect(messagePlainText('배포 실패 — 503 upstream timeout')).toBe('배포 실패 — 503 upstream timeout');
    });

    it('is empty for a missing body', () => {
        expect(messagePlainText(undefined)).toBe('');
    });

    // JSON that is not Block Kit is somebody's message, not a payload.
    it('leaves a JSON message that has no blocks alone', () => {
        expect(messagePlainText('{"a":1}')).toBe('{"a":1}');
    });

    // How the preview surfaces use it: flatten the blocks, then collapse to one line.
    it('composes with toPlainPreview for a one-line row', () => {
        const content = JSON.stringify({
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '로그: `kubectl logs`' } }],
        });

        expect(toPlainPreview(messagePlainText(content))).toBe('로그: kubectl logs');
    });
});
