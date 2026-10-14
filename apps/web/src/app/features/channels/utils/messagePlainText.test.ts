import { deleteConfirmQuote, messagePlainText, messagePreview, messageSearchText } from './messagePlainText';
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

// Copy and the detail dialog read `messagePlainText` and keep the markup; these are for the
// surfaces that only print text.
describe('messagePreview', () => {
    it('drops composer markup and cuts a code block to its first line', () => {
        expect(messagePreview('[가이드](https://example.com/a) 참고\n```sh\nnx build web\nnx deploy web\n```')).toBe(
            '가이드 참고\nnx build web'
        );
    });

    it('flattens a Block Kit body first', () => {
        const content = JSON.stringify({
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '로그: `kubectl logs`' } }],
        });

        expect(messagePreview(content)).toBe('로그: kubectl logs');
    });

    it('is empty for a missing body', () => {
        expect(messagePreview(undefined)).toBe('');
    });
});

describe('messageSearchText', () => {
    it('drops composer markup but keeps every line of a code block', () => {
        expect(messageSearchText('`yarn deploy` 후\n```sh\nnx build web\nnx deploy web\n```')).toBe(
            'yarn deploy 후\nnx build web\nnx deploy web'
        );
    });

    it('is empty for a missing body', () => {
        expect(messageSearchText(undefined)).toBe('');
    });
});

describe('deleteConfirmQuote', () => {
    it('quotes the message on one line with its markup dropped', () => {
        expect(deleteConfirmQuote('  [가이드](https://example.com/a)\n`yarn deploy`  ')).toBe('가이드 yarn deploy');
    });

    it('cuts a long message at 60 characters with an ellipsis', () => {
        const quote = deleteConfirmQuote('가'.repeat(80));
        expect(quote).toBe(`${'가'.repeat(60)}…`);
    });

    it('does not cut a message of exactly 60 characters', () => {
        expect(deleteConfirmQuote('가'.repeat(60))).toBe('가'.repeat(60));
    });

    // The dialog falls back to its generic description on '', so whitespace must not count as text.
    it('is empty for a message with no text to quote', () => {
        expect(deleteConfirmQuote('  \n ')).toBe('');
        expect(deleteConfirmQuote(undefined)).toBe('');
    });
});
