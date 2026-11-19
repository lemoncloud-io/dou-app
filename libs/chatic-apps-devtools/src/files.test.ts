import { lineOf, withoutComments } from './files';

describe('withoutComments', () => {
    it('blanks line and block comments, keeping line breaks and length', () => {
        const text = 'a(); // localStorage\n/* window.open\n here */ b();';
        const out = withoutComments(text);
        expect(out).not.toMatch(/localStorage|window\.open/);
        expect(out.length).toBe(text.length);
        expect(out.split('\n')).toHaveLength(3);
        expect(out).toContain('b();');
    });

    it('keeps strings whole, a `//` inside one included', () => {
        const text = 'fetch(\'https://api.example.net/x\'); call("chat.sendChat", `a // b`);';
        expect(withoutComments(text)).toBe(text);
    });

    it('does not end a string at an escaped quote', () => {
        const text = "const s = 'it\\'s // not a comment';";
        expect(withoutComments(text)).toBe(text);
    });
});

describe('lineOf', () => {
    it('counts lines from 1', () => {
        expect(lineOf('a\nb\nc', 0)).toBe(1);
        expect(lineOf('a\nb\nc', 4)).toBe(3);
    });
});
