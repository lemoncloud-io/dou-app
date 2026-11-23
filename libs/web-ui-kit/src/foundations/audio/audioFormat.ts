export const formatAudioClock = (seconds: number | undefined): string => {
    const total = seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = String(total % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
};

export const formatAudioSize = (bytes: number | undefined): string | undefined => {
    if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return undefined;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

export const formatAudioMeta = (durationSeconds: number | undefined, bytes: number | undefined): string =>
    [
        durationSeconds !== undefined && durationSeconds > 0 ? formatAudioClock(durationSeconds) : undefined,
        formatAudioSize(bytes),
    ]
        .filter(Boolean)
        .join(' · ');
