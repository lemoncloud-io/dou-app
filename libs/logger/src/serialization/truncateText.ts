/**
 * Caps one already-stringified field, recording how much was cut.
 *
 * Shared by the report serializer and the wire mapper: both cap per field, both
 * keep the head, and both must leave the reader able to tell a short value from
 * a shortened one. They keep separate limit constants (different contracts) but
 * the shortening itself is one rule.
 */
export const truncateText = (value: string, max: number): string =>
    value.length > max ? `${value.slice(0, max)}…(+${value.length - max})` : value;
