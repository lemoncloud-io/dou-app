export const formatDate = (timestamp?: number | null, fallback = '-'): string => {
    if (!timestamp) {
        return fallback;
    }

    return new Date(timestamp).toLocaleString();
};
