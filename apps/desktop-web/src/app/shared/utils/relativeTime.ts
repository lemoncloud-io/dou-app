/** Compact relative time for list previews: now, 5m, 3h, 2d, then a short date. */
export const relativeTime = (ms: number | undefined): string => {
    if (!ms) return '';
    const diff = Date.now() - ms;
    if (diff < 0) return '';
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
};
