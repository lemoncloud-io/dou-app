/**
 * HMAC-SHA256, synchronous and dependency-free — the one primitive the masking fingerprints need.
 *
 * Hand-written rather than borrowed because neither platform offers it the way masking runs.
 * WebCrypto's `subtle` is asynchronous, and masking happens inside `JSON.stringify`'s replacer and
 * the wire mapper, which cannot wait. Hermes has no `crypto` at all. A library would be the first
 * dependency of a core that has none, for about a hundred lines that standard test vectors pin
 * completely (`hmacSha256.spec.ts` checks FIPS 180 and RFC 4231 cases, and a sweep against Node's
 * own `crypto`).
 *
 * Speed is not a concern at this size: it runs only on a value a rule has already matched.
 */

const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
    0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
    0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
    0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
]);

const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

const BLOCK_BYTES = 64;

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** UTF-8 bytes of `text`. `TextEncoder` is not guaranteed on every Hermes this app ships to. */
export const utf8Bytes = (text: string): Uint8Array => {
    const out: number[] = [];
    for (let i = 0; i < text.length; i += 1) {
        let code = text.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
            const low = text.charCodeAt(i + 1);
            if (low >= 0xdc00 && low <= 0xdfff) {
                code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
                i += 1;
            }
        }
        if (code < 0x80) out.push(code);
        else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        else {
            out.push(
                0xf0 | (code >> 18),
                0x80 | ((code >> 12) & 0x3f),
                0x80 | ((code >> 6) & 0x3f),
                0x80 | (code & 0x3f)
            );
        }
    }
    return Uint8Array.from(out);
};

export const sha256 = (message: Uint8Array): Uint8Array => {
    // Message, the 0x80 marker, zero fill, and the 64-bit big-endian bit length, to whole blocks.
    const padded = new Uint8Array(Math.ceil((message.length + 9) / BLOCK_BYTES) * BLOCK_BYTES);
    padded.set(message);
    padded[message.length] = 0x80;
    const view = new DataView(padded.buffer);
    const bits = message.length * 8;
    view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
    view.setUint32(padded.length - 4, bits >>> 0);

    // A Uint32Array wraps every assignment modulo 2^32, which is the arithmetic SHA-256 is defined in.
    const h = Uint32Array.from(H0);
    const w = new Uint32Array(64);
    for (let offset = 0; offset < padded.length; offset += BLOCK_BYTES) {
        for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
        for (let i = 16; i < 64; i += 1) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }

        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i += 1) {
            const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
            const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
            hh = g;
            g = f;
            f = e;
            e = (d + t1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) >>> 0;
        }
        h[0] += a;
        h[1] += b;
        h[2] += c;
        h[3] += d;
        h[4] += e;
        h[5] += f;
        h[6] += g;
        h[7] += hh;
    }

    const digest = new Uint8Array(32);
    const out = new DataView(digest.buffer);
    h.forEach((word, i) => out.setUint32(i * 4, word));
    return digest;
};

export const hmacSha256 = (key: Uint8Array, message: Uint8Array): Uint8Array => {
    const block = new Uint8Array(BLOCK_BYTES);
    block.set(key.length > BLOCK_BYTES ? sha256(key) : key);

    const inner = new Uint8Array(BLOCK_BYTES + message.length);
    const outer = new Uint8Array(BLOCK_BYTES + 32);
    for (let i = 0; i < BLOCK_BYTES; i += 1) {
        inner[i] = block[i] ^ 0x36;
        outer[i] = block[i] ^ 0x5c;
    }
    inner.set(message, BLOCK_BYTES);
    outer.set(sha256(inner), BLOCK_BYTES);
    return sha256(outer);
};

export const toHex = (bytes: Uint8Array): string =>
    Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

/** HMAC-SHA256 of two strings, UTF-8 encoded, as lower-case hex. */
export const hmacSha256Hex = (key: string, message: string): string =>
    toHex(hmacSha256(utf8Bytes(key), utf8Bytes(message)));
