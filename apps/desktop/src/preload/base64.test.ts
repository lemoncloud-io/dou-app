import { utf8ToBase64 } from './base64';

const oracle = (value: string): string => Buffer.from(value, 'utf8').toString('base64');

describe('utf8ToBase64', () => {
    it('matches Buffer for ASCII', () => {
        expect(utf8ToBase64('hello')).toBe(oracle('hello'));
    });

    it('encodes the empty string', () => {
        expect(utf8ToBase64('')).toBe('');
    });

    it('matches Buffer for Korean text', () => {
        const korean = '안녕하세요, 반갑습니다';
        expect(utf8ToBase64(korean)).toBe(oracle(korean));
    });

    it('matches Buffer for emoji (surrogate pairs)', () => {
        expect(utf8ToBase64('🍋🎉')).toBe(oracle('🍋🎉'));
    });

    it('matches Buffer for the characters the injection guard exists for', () => {
        const hostile = '</script><script>alert(1)</script>  ';
        expect(utf8ToBase64(hostile)).toBe(oracle(hostile));
    });

    it('round-trips through the decoder the injected snippet uses', () => {
        const value = '채널 이름 🍋 </script> ';
        const decoded = new TextDecoder().decode(Uint8Array.from(atob(utf8ToBase64(value)), c => c.charCodeAt(0)));
        expect(decoded).toBe(value);
    });

    it('encodes a payload larger than one chunk', () => {
        const large = '안녕'.repeat(300_000);
        expect(utf8ToBase64(large)).toBe(oracle(large));
    });
});
