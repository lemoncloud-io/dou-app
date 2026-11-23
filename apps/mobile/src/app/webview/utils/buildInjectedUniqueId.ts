export const UNIQUE_ID_SEPARATOR = ':';

export const buildInjectedUniqueId = (deviceId: string, firebaseInstallId?: string | null): string => {
    return [deviceId, firebaseInstallId]
        .map(part => (typeof part === 'string' ? part.trim() : ''))
        .filter(part => part.length > 0)
        .join(UNIQUE_ID_SEPARATOR);
};
