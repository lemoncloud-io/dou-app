export const secondsUntil = (iso: string, nowMs: number): number =>
    Math.max(0, Math.ceil((Date.parse(iso) - nowMs) / 1000));

export const formatMinutesSeconds = (seconds: number): string =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export const formatTimeOfDay = (iso: string): string => {
    const date = new Date(iso);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
