/**
 * Bytes to base64, in chunks.
 *
 * `btoa(String.fromCharCode(...bytes))` is the one-liner everyone writes and it throws on real
 * files: spreading a multi-megabyte array into an argument list overflows the call stack (the limit
 * is in the tens of thousands of arguments, and an inline upload here can be 4.5 MB). Walking the
 * array in fixed windows keeps the argument count bounded and the output identical.
 */
const CHUNK = 0x8000;

export const toBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += CHUNK) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(offset, offset + CHUNK)));
    }
    return btoa(binary);
};
