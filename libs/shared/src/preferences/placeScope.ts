export const placeScopeKey = (cloudId?: string | null, placeId?: string | null): string | null =>
    cloudId && placeId ? `${cloudId}:${placeId}` : null;

export const isPlaceScopeKey = (key: string): boolean => key.includes(':');
