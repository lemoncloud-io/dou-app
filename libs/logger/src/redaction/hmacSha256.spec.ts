import { createHash, createHmac } from 'crypto';

import { hmacSha256, hmacSha256Hex, sha256, toHex, utf8Bytes } from './hmacSha256';

const hex = (text: string) => toHex(sha256(utf8Bytes(text)));
const bytes = (byte: number, length: number) => new Uint8Array(length).fill(byte);

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

describe('hmacSha256', () => {
    it('matches RFC 4231 test cases 1, 2 and 6', () => {
        expect(toHex(hmacSha256(bytes(0x0b, 20), utf8Bytes('Hi There')))).toBe(
            'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
        );
        expect(hmacSha256Hex('Jefe', 'what do ya want for nothing?')).toBe(
            '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
        );
        // A key longer than the block is hashed first.
        expect(
            toHex(hmacSha256(bytes(0xaa, 131), utf8Bytes('Test Using Larger Than Block-Size Key - Hash Key First')))
        ).toBe('60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54');
    });

    it('encodes text as UTF-8, astral characters included, the way Node does', () => {
        const samples = ['someone@user.test', '010-1234-5678', '나와의 채팅', 'emoji 🙂 pair', 'x'.repeat(200)];
        for (const message of samples) {
            const key = `salt-${message.length}-가나다`;
            expect(hmacSha256Hex(key, message)).toBe(createHmac('sha256', key).update(message).digest('hex'));
        }
    });
});
