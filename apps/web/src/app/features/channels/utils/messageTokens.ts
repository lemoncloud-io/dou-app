/**
 * Splits message text into plain runs, URL runs, and code runs.
 *
 * NOT markdown. The only markup understood here is inline backticks and triple-backtick fences —
 * bold, italics, headings, lists, quotes and link syntax are all still plain text. Widening that
 * list is a product decision (ADR-0055 widened it once, for code), not something to slip in while
 * touching this file.
 *
 * Code is resolved BEFORE URLs, so a `https://…` inside a code span stays literal: it is not
 * linked, and `extractFirstUrl` does not offer it to the unfurl card. That ordering is the point,
 * not a side effect — a URL in a code example must not summon a preview card.
 */

export type MessageToken =
    | { type: 'text'; value: string }
    | { type: 'url'; value: string }
    | { type: 'code'; value: string }
    | { type: 'codeBlock'; value: string; lang?: string };

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

/** Punctuation that ends a sentence far more often than it ends a URL. */
const TRAILING_PUNCTUATION = /[.,;:!?'"·…]+$/;

const BRACKET_PAIRS = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
] as const;

const FENCE = '```';
/** An opening fence's info string — a bare language tag, nothing exotic. */
const LANG_PATTERN = /^[A-Za-z0-9_+#-]*$/;
/** Inline code: shortest backtick pair that stays on one line. */
const INLINE_CODE_PATTERN = /`([^`\n]+)`/g;

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

export interface TokenizeOptions {
    /**
     * The text was cut short. Two consequences: a URL running to the very end may be a fragment of
     * a longer address, so it is left as plain text (navigating to the wrong page is worse than not
     * offering a link); and a fence left open at the cut is treated as closed, since the missing
     * half is on the other side of the truncation rather than absent from the message.
     */
    truncated?: boolean;
}

/** Splits an opening fence's body into its language tag and its code. */
const splitFenceBody = (body: string): { lang?: string; value: string } => {
    const newline = body.indexOf('\n');
    if (newline === -1) return { value: body };

    const info = body.slice(0, newline).trim();
    // A first line that isn't a plain language tag is code, not an info string: ```\nconst x = 1\n```
    // has an empty info line, while ```const x = 1``` written across lines has a real one.
    if (!LANG_PATTERN.test(info)) return { value: body };
    return { lang: info || undefined, value: body.slice(newline + 1) };
};

/** Trailing newline immediately before a closing fence belongs to the fence, not the code. */
const trimFenceEdges = (value: string): string => value.replace(/\n$/, '');

type Segment = { type: 'text'; value: string } | Extract<MessageToken, { type: 'codeBlock' }>;

/** Pass 1 — carve out fenced blocks, leaving everything else as raw text to look at later. */
const splitFences = (text: string, truncated: boolean): Segment[] => {
    const segments: Segment[] = [];
    let buffer = '';
    let index = 0;

    const flush = () => {
        if (buffer) segments.push({ type: 'text', value: buffer });
        buffer = '';
    };

    while (index < text.length) {
        if (!text.startsWith(FENCE, index)) {
            buffer += text[index];
            index += 1;
            continue;
        }

        const bodyStart = index + FENCE.length;
        const close = text.indexOf(FENCE, bodyStart);

        if (close === -1) {
            // Unterminated. When the text was cut, the closing fence is beyond the cut, so honour
            // the block; otherwise the user simply typed three backticks — leave them as text.
            if (!truncated) {
                buffer += FENCE;
                index = bodyStart;
                continue;
            }
            const { lang, value } = splitFenceBody(text.slice(bodyStart));
            flush();
            segments.push({ type: 'codeBlock', value: trimFenceEdges(value), lang });
            return segments;
        }

        const { lang, value } = splitFenceBody(text.slice(bodyStart, close));
        flush();
        segments.push({ type: 'codeBlock', value: trimFenceEdges(value), lang });
        index = close + FENCE.length;
    }

    flush();
    return segments;
};

/** Pass 3 — URLs, over one run of non-code text. */
const tokenizeUrls = (text: string, dropTrailingUrl: boolean): MessageToken[] => {
    const tokens: MessageToken[] = [];
    let last = 0;
    let match: RegExpExecArray | null;

    URL_PATTERN.lastIndex = 0;
    while ((match = URL_PATTERN.exec(text)) !== null) {
        const url = trimTrailingNoise(match[0]);
        const reachesEnd = match.index + match[0].length === text.length;

        // Skipped matches stay inside the surrounding text run: `last` is left untouched, and the
        // regex has already advanced past them so they aren't reconsidered.
        if (!isLinkable(url) || (dropTrailingUrl && reachesEnd)) continue;

        if (match.index > last) tokens.push({ type: 'text', value: text.slice(last, match.index) });
        tokens.push({ type: 'url', value: url });
        last = match.index + url.length;
    }

    if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) });
    return tokens;
};

/** Pass 2 — inline backticks, then hand the leftovers to the URL pass. */
const tokenizeInline = (text: string, dropTrailingUrl: boolean): MessageToken[] => {
    const tokens: MessageToken[] = [];
    let last = 0;
    let match: RegExpExecArray | null;

    const pushText = (value: string, isFinal: boolean) => {
        if (value) tokens.push(...tokenizeUrls(value, dropTrailingUrl && isFinal));
    };

    INLINE_CODE_PATTERN.lastIndex = 0;
    while ((match = INLINE_CODE_PATTERN.exec(text)) !== null) {
        pushText(text.slice(last, match.index), false);
        tokens.push({ type: 'code', value: match[1] });
        last = match.index + match[0].length;
    }

    pushText(text.slice(last), true);
    return tokens;
};

export const tokenizeMessage = (text: string, options?: TokenizeOptions): MessageToken[] => {
    if (!text) return [];

    const truncated = options?.truncated === true;
    const segments = splitFences(text, truncated);

    return segments.flatMap((segment, index) => {
        if (segment.type === 'codeBlock') return [segment];
        // Only a URL at the very end of the whole message can be a truncation fragment.
        const isFinal = index === segments.length - 1;
        return tokenizeInline(segment.value, truncated && isFinal);
    });
};

/**
 * The URL a message's preview card should unfurl — the first one, Slack-style.
 *
 * Runs on the full message content, not the truncated bubble text, so a long message still gets a
 * card for a link that the bubble had to cut. Shares `tokenizeMessage`' trimming so the unfurl
 * cache key always equals the href rendered in the bubble — and skips code, so a URL in a code
 * example never summons a card.
 */
export const extractFirstUrl = (text: string): string | undefined =>
    tokenizeMessage(text).find(token => token.type === 'url')?.value;

/**
 * Message text flattened for a one-line preview (the home list).
 *
 * The home row has nowhere to render a code block, so markup characters would just read as noise
 * there. Backticks are stripped and a fenced block collapses to its first line — no badge, no
 * monospace, nothing that would complicate the row or tangle with the blur-preview setting.
 */
export const toPlainPreview = (text: string): string =>
    tokenizeMessage(text)
        .map(token => (token.type === 'codeBlock' ? (token.value.split('\n')[0] ?? '') : token.value))
        .join('');
