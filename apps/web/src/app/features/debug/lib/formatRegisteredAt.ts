export const formatRegisteredAt = (value?: number | null): string => {
    if (!value) return '-';
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};
