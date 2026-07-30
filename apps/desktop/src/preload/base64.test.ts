import { utf8ToBase64 } from './base64';

/**
 * Node's Buffer is the oracle on purpose: this encoder replaces
 * `Buffer.from(s, 'utf8').toString('base64')` in the preload (Buffer is gone under
 * `sandbox: true`), so equivalence with what it replaced is the property that matters.
 */
const oracle = (value: string): string => Buffer.from(value, 'utf8').toString('base64');

describe('utf8ToBase64', () => {
    it('matches Buffer for ASCII', () => {
        expect(utf8ToBase64('hello')).toBe(oracle('hello'));
    });

    it('encodes the empty string', () => {
        expect(utf8ToBase64('')).toBe('');
    });

    it('matches Buffer for Korean text', () => {
        // The app is Korean-language: a naive btoa(s) throws here, which is the whole
        // reason this module exists.
        const korean = '안녕하세요, 반갑습니다';
        expect(utf8ToBase64(korean)).toBe(oracle(korean));
    });

    it('matches Buffer for emoji (surrogate pairs)', () => {
        expect(utf8ToBase64('🍋🎉')).toBe(oracle('🍋🎉'));
    });

    it('matches Buffer for the characters the injection guard exists for', () => {
        // </script>, U+2028 and U+2029 are what JSON.stringify fails to escape — they must
        // survive as base64 payload rather than participate in the JS grammar.
        const hostile = '</script><script>alert(1)</script>  ';
        expect(utf8ToBase64(hostile)).toBe(oracle(hostile));
    });

    it('round-trips through the decoder the injected snippet uses', () => {
        // Mirrors `new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))`
        // in preload/index.ts — the encoder is only correct if that exact reader gets it back.
        const value = '채널 이름 🍋 </script> ';
        const decoded = new TextDecoder().decode(Uint8Array.from(atob(utf8ToBase64(value)), c => c.charCodeAt(0)));
        expect(decoded).toBe(value);
    });

    it('encodes a payload larger than one chunk', () => {
        // Pins the chunked loop: a single `String.fromCharCode(...bytes)` over the whole
        // array blows the argument stack well below this size.
        const large = '안녕'.repeat(300_000); // ~1.8MB of UTF-8
        expect(utf8ToBase64(large)).toBe(oracle(large));
    });
});
