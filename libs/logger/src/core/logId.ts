/**
 * Globally unique id for a single log entry — the server's dedup key. The id
 * becomes the stored document id, so a resend upserts the same document
 * instead of piling up duplicates. Issued at dispatch (not at flush) so the
 * value stays stable across retries of the same entry.
 *
 * Deliberately dependency-free: this package declares `dependencies: {}` and
 * imports no external module (see design principle 1), so the workspace's
 * `uuid` package is not pulled in here. The randomness sources are probed
 * defensively — React Native Hermes and older WebViews ship neither
 * `randomUUID` nor `getRandomValues` reliably.
 */

interface CryptoLike {
    randomUUID?: () => string;
    getRandomValues?: (array: Uint8Array) => Uint8Array;
}

const BYTE_TO_HEX = Array.from({ length: 256 }, (_, i) => (i + 0x100).toString(16).slice(1));

const readCrypto = (): CryptoLike | undefined => (globalThis as { crypto?: CryptoLike }).crypto;

/** Formats 16 random bytes as an RFC 4122 v4 UUID, pinning version/variant bits. */
const formatUuidV4 = (bytes: Uint8Array): string => {
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
    const h = BYTE_TO_HEX;

    return (
        `${h[bytes[0]]}${h[bytes[1]]}${h[bytes[2]]}${h[bytes[3]]}-` +
        `${h[bytes[4]]}${h[bytes[5]]}-` +
        `${h[bytes[6]]}${h[bytes[7]]}-` +
        `${h[bytes[8]]}${h[bytes[9]]}-` +
        `${h[bytes[10]]}${h[bytes[11]]}${h[bytes[12]]}${h[bytes[13]]}${h[bytes[14]]}${h[bytes[15]]}`
    );
};

export const createLogId = (): string => {
    const cryptoLike = readCrypto();

    if (typeof cryptoLike?.randomUUID === 'function') {
        try {
            return cryptoLike.randomUUID();
        } catch {
            // Some WebViews expose the method but reject it outside a secure context.
        }
    }

    const bytes = new Uint8Array(16);

    if (typeof cryptoLike?.getRandomValues === 'function') {
        try {
            cryptoLike.getRandomValues(bytes);
            return formatUuidV4(bytes);
        } catch {
            // Fall through to the arithmetic source below.
        }
    }

    for (let i = 0; i < 16; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
    }

    return formatUuidV4(bytes);
};
