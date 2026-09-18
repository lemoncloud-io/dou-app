import type { UploadSource } from 'lemon-model/upload/engine';

/**
 * sha256 of the bytes, hex(64) — the form the upload contract asks for.
 *
 * Returns undefined rather than throwing when the digest is unavailable. `crypto.subtle` exists
 * only in a secure context, so a plain-http dev server has none; the contract keeps `hash` optional
 * forever for exactly this reason, and an upload without it is accepted. Sending it is still worth
 * it where it works: the server signs `x-amz-checksum-sha256` with it and S3 then rejects a body
 * that does not match.
 */
export const sha256Hex = async (bytes: ArrayBuffer): Promise<string | undefined> => {
    if (typeof crypto === 'undefined' || !crypto.subtle) return undefined;
    try {
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    } catch {
        // A hostile or partial implementation is the same situation as not having one.
        return undefined;
    }
};

/**
 * A picked `File` as the engine's byte provider.
 *
 * This is the whole of what a browser shell has to supply for the file half: the engine asks for
 * name, type, size and bytes, and everything platform-specific ends here. A shell that gets its
 * bytes some other way (a native picker handing back a uri) implements the same interface instead
 * of changing anything above it.
 *
 * `bytes()` reads the file whole — the contract's roadmap-1/2 sizes assume that, and the engine has
 * no streaming path yet. That is the reason a client-side size ceiling exists rather than deferring
 * to the server's much larger abuse ceiling.
 */
export const fileUploadSource = (file: File): UploadSource => ({
    name: file.name,
    contentType: file.type,
    contentSize: file.size,
    bytes: async () => new Uint8Array(await file.arrayBuffer()),
    hash: () => file.arrayBuffer().then(sha256Hex),
});
