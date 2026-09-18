/**
 * `unfurl.ts`
 * - link preview (URL unfurl) message payloads
 *
 * The desktop shell's main process fetches the URL and parses og: metadata on the web's
 * behalf (the renderer can't read external pages due to CORS).
 */

/** [Request] Fetch URL metadata (og:) payload (web -> app). */
export type FetchUrlMetadataPayload = {
    url: string;
};

/** [Response] URL metadata result payload. success=false means no preview (a candidate for negative caching). */
export type OnFetchUrlMetadataPayload = {
    success: boolean;
    url: string;
    title?: string;
    description?: string;
    /** Only https image URLs are passed (binary data is not sent over IPC). */
    imageUrl?: string;
    siteName?: string;
};
