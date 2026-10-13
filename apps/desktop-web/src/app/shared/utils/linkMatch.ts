/**
 * Regex source for a bare URL in message text. Single source for the message
 * renderer (which turns it into an anchor) and the composer (which shows it as a
 * link while typing), so what the composer marks as a link is exactly what
 * readers get as one. Wrap it in a capture group when combining it.
 */
export const LINK_URL_SOURCE = 'https?:\\/\\/[^\\s]+';

/** A labelled link's address: http(s), a host character first, no spaces or parentheses. */
const LABELLED_ADDRESS_SOURCE = 'https?:\\/\\/[^\\s()/?#][^\\s()]*';

/**
 * Regex source for a labelled link, `[words](address)`: group 1 is the words, group 2 the address.
 * The words hold no brackets or line breaks and the address is as above, so `[x] done (see notes)`
 * and `[x](javascript:…)` stay text. Shared by the message renderer, the plain-text previews and
 * the composer's reading of a message; apps/web holds the same rule.
 */
export const LABELLED_LINK_SOURCE = `\\[([^\\[\\]\\n]+)\\]\\((${LABELLED_ADDRESS_SOURCE})\\)`;

const LABELLED_ADDRESS = new RegExp(`^${LABELLED_ADDRESS_SOURCE}$`);

/** Whether a message can carry this address as a labelled link's target. */
export const isLabelledLinkAddress = (url: string): boolean => LABELLED_ADDRESS.test(url);

/**
 * Words as a labelled link can carry them: brackets would end the words early, so they become
 * parentheses, and line breaks become spaces.
 */
export const toLabelledLinkWords = (words: string): string =>
    words
        .replace(/\[/g, '(')
        .replace(/\]/g, ')')
        .replace(/\s*\n\s*/g, ' ');
