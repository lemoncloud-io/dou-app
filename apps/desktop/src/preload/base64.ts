/**
 * UTF-8 → base64, the only encoding point in the preload.
 *
 * Replaces `Buffer.from(value, 'utf8').toString('base64')`: `Buffer` is a Node global and a
 * sandboxed preload has no Node. The naive replacement, `btoa(value)`, is not equivalent —
 * it throws on any code unit above U+00FF, and what this encodes is arbitrary bridge payload
 * (channel names, message bodies) in a Korean-language app. Going through `TextEncoder` first
 * makes every input a byte sequence, which is what base64 is defined over.
 *
 * The counterpart decoder lives inside the injected snippet in `./index.ts`:
 * `new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))`.
 */

/**
 * Bytes per `String.fromCharCode` call. The spread becomes one argument per byte, so passing
 * a whole message at once overflows the argument stack; 0x8000 is the usual safe ceiling.
 */
const CHUNK_SIZE = 0x8000;

export const utf8ToBase64 = (value: string): string => {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
    }
    return btoa(binary);
};
