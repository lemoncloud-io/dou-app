export type FetchUrlMetadataPayload = {
    url: string;
};

export type OnFetchUrlMetadataPayload = {
    success: boolean;
    url: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    siteName?: string;
};
