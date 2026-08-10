import type { OnFetchUrlMetadataPayload } from '@chatic/app-messages';

/** Result of an unfurl attempt. `success: false` means "no preview" — never an error to surface. */
export type UrlMetadataResult = OnFetchUrlMetadataPayload;

export interface IUnfurlService {
    /**
     * Fetches a page and extracts its og: metadata for a chat link preview.
     *
     * Never throws and never rejects: a malformed URL, a blocked host, a timeout, a non-HTML
     * response, or a page without a title all resolve to `{ success: false, url }`.
     */
    fetchUrlMetadata(url: string): Promise<UrlMetadataResult>;
}
