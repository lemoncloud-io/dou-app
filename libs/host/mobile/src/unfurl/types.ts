import type { OnFetchUrlMetadataPayload } from '@chatic/bridge-messages';

export type UrlMetadataResult = OnFetchUrlMetadataPayload;

export interface IUnfurlService {
    fetchUrlMetadata(url: string): Promise<UrlMetadataResult>;
}
