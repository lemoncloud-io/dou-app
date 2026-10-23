import { createHash } from 'crypto';

import { sha256, toHex, utf8Bytes } from './sha256';

const hex = (text: string) => toHex(sha256(utf8Bytes(text)));

describe('sha256', () => {
    it('matches the FIPS 180-2 examples', () => {
        expect(hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        expect(hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
        expect(hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
            '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
        );
    });

    it('agrees with Node across every length around the block and padding boundaries', () => {
        for (let length = 0; length <= 130; length += 1) {
            const text = 'a'.repeat(length);
            expect(hex(text)).toBe(createHash('sha256').update(text).digest('hex'));
        }
    });
});

describe('utf8Bytes', () => {
    it('encodes text as UTF-8, astral characters included, the way Node does', () => {
        for (const text of ['someone@user.test', '나와의 채팅', 'emoji 🙂 pair', 'x'.repeat(200)]) {
            expect(toHex(sha256(utf8Bytes(text)))).toBe(createHash('sha256').update(text).digest('hex'));
        }
    });
});
