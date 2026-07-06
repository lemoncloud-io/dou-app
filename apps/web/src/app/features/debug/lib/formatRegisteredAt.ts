/**
 * Formats a register-device timestamp for display.
 *
 * The backend value may be epoch **seconds** or **milliseconds** depending on
 * the record, so values below ~1e10 are treated as seconds and scaled up.
 * Returns a placeholder for missing values and echoes the raw input if it is not
 * a valid date.
 */
export const formatRegisteredAt = (value?: number | null): string => {
    if (!value) return '-';
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};
