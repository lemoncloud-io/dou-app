/**
 * Regex source for a bare URL in message text. Single source for the message
 * renderer (which turns it into an anchor) and the composer (which shows it as a
 * link while typing), so what the composer marks as a link is exactly what
 * readers get as one. Wrap it in a capture group when combining it.
 */
export const LINK_URL_SOURCE = 'https?:\\/\\/[^\\s]+';
