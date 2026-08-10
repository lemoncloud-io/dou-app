/**
 * Splits message text into plain runs and URL runs.
 *
 * Deliberately URLs only — no markdown, no mentions. Message content is rendered as React text
 * nodes either way, so nothing here can inject markup; widening this to real formatting is a
 * product decision, not a side effect of link previews.
 */

export type LinkToken = { type: 'text' | 'url'; value: string };

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

/** Punctuation that ends a sentence far more often than it ends a URL. */
const TRAILING_PUNCTUATION = /[.,;:!?'"·…]+$/;

const BRACKET_PAIRS = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
] as const;

const countChar = (value: string, char: string): number => value.split(char).length - 1;

/**
 * Drops characters that the greedy match swallowed but that aren't part of the address:
 * `자세히는 https://example.com/a.` must link to `/a`, not `/a.`.
 *
 * Closing brackets are counted rather than stripped, so `(see https://example.com/a)` loses its
 * `)` while `https://en.wikipedia.org/wiki/Foo_(bar)` keeps it. Repeated until stable because
 * removing a bracket can expose more punctuation underneath.
 */
const trimTrailingNoise = (url: string): string => {
    let result = url;
    let previous: string;
    do {
        previous = result;
        result = result.replace(TRAILING_PUNCTUATION, '');
        for (const [open, close] of BRACKET_PAIRS) {
            while (result.endsWith(close) && countChar(result, close) > countChar(result, open)) {
                result = result.slice(0, -1);
            }
        }
    } while (result !== previous);
    return result;
};

/** Rejects leftovers like a bare `https://` once the trailing noise is gone. */
const isLinkable = (url: string): boolean => /^https?:\/\/[^\s/?#]/i.test(url);

export interface TokenizeLinksOptions {
    /**
     * The text was cut short, so a URL that runs to its very end may be a fragment of a longer
     * address. Such a URL is left as plain text — navigating to the wrong page is worse than not
     * offering a link.
     */
    dropTrailingUrl?: boolean;
}

export const tokenizeLinks = (text: string, options?: TokenizeLinksOptions): LinkToken[] => {
    if (!text) return [];

    const tokens: LinkToken[] = [];
    let last = 0;
    let match: RegExpExecArray | null;

    URL_PATTERN.lastIndex = 0;
    while ((match = URL_PATTERN.exec(text)) !== null) {
        const url = trimTrailingNoise(match[0]);
        const reachesEnd = match.index + match[0].length === text.length;

        // Skipped matches stay inside the surrounding text run: `last` is left untouched, and the
        // regex has already advanced past them so they aren't reconsidered.
        if (!isLinkable(url) || (options?.dropTrailingUrl === true && reachesEnd)) continue;

        if (match.index > last) tokens.push({ type: 'text', value: text.slice(last, match.index) });
        tokens.push({ type: 'url', value: url });
        last = match.index + url.length;
    }

    if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) });
    return tokens;
};

/**
 * The URL a message's preview card should unfurl — the first one, Slack-style.
 *
 * Runs on the full message content, not the truncated bubble text, so a long message still gets a
 * card for a link that the bubble had to cut. Shares `tokenizeLinks`' trimming so the unfurl cache
 * key always equals the href rendered in the bubble.
 */
export const extractFirstUrl = (text: string): string | undefined =>
    tokenizeLinks(text).find(token => token.type === 'url')?.value;
