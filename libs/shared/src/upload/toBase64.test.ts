import { toBase64 } from './toBase64';

describe('toBase64', () => {
    it('matches btoa for a short input', () => {
        const bytes = new Uint8Array([104, 105]);

        expect(toBase64(bytes)).toBe(btoa('hi'));
    });

    it('handles the full byte range, not just ASCII', () => {
        const bytes = new Uint8Array(256);
        for (let i = 0; i < 256; i += 1) bytes[i] = i;

        const decoded = atob(toBase64(bytes));

        expect(decoded.length).toBe(256);
        expect(decoded.charCodeAt(255)).toBe(255);
    });

    it('is empty for no bytes', () => {
        expect(toBase64(new Uint8Array(0))).toBe('');
    });

    // The reason this function exists: `String.fromCharCode(...bytes)` on a real attachment blows
    // the call stack. A 5 MB input is an ordinary inline upload, so it has to pass.
    it('encodes megabytes without overflowing the stack', () => {
        const bytes = new Uint8Array(5 * 1024 * 1024).fill(65);

        const encoded = toBase64(bytes);

        expect(encoded.length).toBe(Math.ceil(bytes.length / 3) * 4);
        expect(atob(encoded).length).toBe(bytes.length);
    });
});
