/**
 * Splits message text into the runs the bubble draws: plain text, links, code, inline marks and
 * quotes.
 *
 * The markup is the desktop composer's dialect, and only that: backtick fences, `> ` quote
 * lines, inline backticks, labelled links (`[words](https://…)`), `**bold**`, `*italic*` and
 * `~~strike~~`. Quotes and marks are matched by the desktop reader's rules, so they read the same on
 * both. It is not markdown — headings and lists stay plain text, and nothing can be escaped. Marks do
 * not nest: the words inside one are plain text, as on desktop.
 *
 * Code is resolved BEFORE URLs, so a `https://…` inside a code span stays literal: it is not
 * linked, and `extractFirstUrl` does not offer it to the unfurl card. That ordering is the point,
 * not a side effect — a URL in a code example must not summon a preview card.
 */

/** A run inside one line of flowing text — what a quote is made of, too. */
export type InlineToken =
    | { type: 'text'; value: string }
    | { type: 'url'; value: string; label?: string }
    | { type: 'code'; value: string }
    | { type: 'bold' | 'italic' | 'strike'; value: string };

export type MessageToken =
    | InlineToken
    | { type: 'codeBlock'; value: string; lang?: string }
    /** Consecutive `> ` lines, without their markers. Fences are carved out first, so none sit inside. */
    | { type: 'quote'; children: InlineToken[] };

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

/**
 * `[words](address)`: words with no brackets or line breaks, an http(s) address that starts with a
 * host character and holds no spaces or parentheses — so `[x] done (see notes)` and
 * `[x](javascript:…)` stay text. The same rule as the desktop reader's.
 */
const LABELLED_LINK_PATTERN = /\[([^[\]\n]+)\]\((https?:\/\/[^\s()/?#][^\s()]*)\)/g;

/** Punctuation that ends a sentence far more often than it ends a URL. */
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', "'", '"', '·', '…']);

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
/**
 * A quote line: `>` followed by a space (or nothing), the same as the desktop reader. The space is
 * required so `>_<` and `>.<`, common in Korean chat, stay text; the composer always writes `> `.
 */
const QUOTE_LINE_PATTERN = /^>(?:\s(.*))?$/;

/**
 * One pass over a non-code run, leftmost match first: labelled links, then bold, italic and
 * strikethrough, then bare URLs. A labelled link is listed first so its address is not read as a bare
 * one, and bold before italic so `**x**` is bold. Each mark stays on one line and needs its closing
 * marker, so a lone `*` or a mark cut off by truncation stays text. Sharing one pass with bare URLs
 * is what keeps a mark inside an address (`…/a*b*`) part of the address, as on desktop.
 *
 * Capture groups: 1–2 labelled link, 3 bold, 4 italic, 5 strike, 6 bare URL.
 */
const INLINE_PATTERN = new RegExp(
    `${LABELLED_LINK_PATTERN.source}|(\\*\\*[^*\\n]+\\*\\*)|(\\*[^*\\n]+\\*)|(~~[^~\\n]+~~)|(${URL_PATTERN.source})`,
    'g'
);

/**
 * Drops characters that the greedy match swallowed but that aren't part of the address:
 * `For details, see https://example.com/a.` must link to `/a`, not `/a.`.
 *
 * Closing brackets are counted rather than stripped, so `(see https://example.com/a)` loses its
 * `)` while `https://en.wikipedia.org/wiki/Foo_(bar)` keeps it. Repeated until stable because
 * removing a bracket can expose more punctuation underneath.
 *
 * Counts are taken once and decremented as characters are dropped, and the walk moves an index
 * rather than reslicing. The earlier version re-ran a `$`-anchored regex and six `split()` scans
 * over the whole string on every dropped character — quadratic, and message content is chosen by
 * whoever sends it, so a run of 60k punctuation marks froze the main thread for ~9s. That is now
 * reachable from the home list too, where one message would have hung the screen for every member
 * of the channel.
 */
const trimTrailingNoise = (url: string): string => {
    const counts = new Map<string, number>();
    for (let index = 0; index < url.length; index += 1) {
        const char = url[index] as string;
        counts.set(char, (counts.get(char) ?? 0) + 1);
    }

    let end = url.length;
    const dropLast = () => {
        const char = url[end - 1] as string;
        counts.set(char, (counts.get(char) ?? 1) - 1);
        end -= 1;
    };

    let changed = true;
    while (changed) {
        changed = false;
        while (end > 0 && TRAILING_PUNCTUATION.has(url[end - 1] as string)) {
            dropLast();
            changed = true;
        }
        for (const [open, close] of BRACKET_PAIRS) {
            while (end > 0 && url[end - 1] === close && (counts.get(close) ?? 0) > (counts.get(open) ?? 0)) {
                dropLast();
                changed = true;
            }
        }
    }
    return url.slice(0, end);
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
    /**
     * Close a dangling fence WITHOUT also distrusting a trailing URL — the half of `truncated` that
     * `extractFirstUrl` needs. It runs on the full message so a link the bubble had to cut still
     * gets a card, but it has to agree with the bubble about which runs are code.
     */
    closeDanglingFence?: boolean;
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

/**
 * Finds the run of backticks that closes a fence opened by `fenceLength` of them: the first run at
 * or after `from` that is at least as long. Returns where that run starts and ends, or `undefined`
 * when the fence is never closed.
 */
const findClosingRun = (
    text: string,
    from: number,
    fenceLength: number
): { start: number; end: number } | undefined => {
    for (let start = text.indexOf('`', from); start !== -1; ) {
        let end = start;
        while (text[end] === '`') end += 1;
        if (end - start >= fenceLength) return { start, end };
        start = text.indexOf('`', end);
    }
    return undefined;
};

/**
 * Pass 1 — carve out fenced blocks, leaving everything else as raw text to look at later.
 *
 * A fence opens with a run of three or more backticks and closes at the next run at least as long,
 * which it consumes whole — the desktop reader's rule. Matching the run length is what lets a block
 * hold ```` ``` ```` itself: the desktop composer lengthens the fence around such code to four, and
 * closing at the next three cut that block short and spilled the rest of it out as text.
 */
const splitFences = (text: string, closeDanglingFence: boolean): Segment[] => {
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

        let bodyStart = index;
        while (text[bodyStart] === '`') bodyStart += 1;
        const close = findClosingRun(text, bodyStart, bodyStart - index);

        // The newline that ends the line the fence sits on belongs to the fence, not to the text
        // around it. The bubble renders with `whitespace-pre-wrap` and the block is already its own
        // box, so leaving it in stacks a blank line above (and below) every block.
        const flushBeforeFence = () => {
            if (buffer.endsWith('\n')) buffer = buffer.slice(0, -1);
            flush();
        };

        if (!close) {
            // Unterminated. When the text was cut, the closing fence is beyond the cut, so honour
            // the block; otherwise the user simply typed backticks — leave the whole run as text.
            if (!closeDanglingFence) {
                buffer += text.slice(index, bodyStart);
                index = bodyStart;
                continue;
            }
            const { lang, value } = splitFenceBody(text.slice(bodyStart));
            flushBeforeFence();
            segments.push({ type: 'codeBlock', value: trimFenceEdges(value), lang });
            return segments;
        }

        const { lang, value } = splitFenceBody(text.slice(bodyStart, close.start));
        flushBeforeFence();
        segments.push({ type: 'codeBlock', value: trimFenceEdges(value), lang });
        index = close.end;
        if (text[index] === '\n') index += 1;
    }

    flush();
    return segments;
};

/**
 * Pass 4 — links and marks over one run of non-code text. A bare URL is trimmed of trailing noise,
 * and one that reaches the cut of a truncated message is left as text: it may be a fragment.
 */
const tokenizeMarks = (text: string, dropTrailingUrl: boolean): InlineToken[] => {
    const tokens: InlineToken[] = [];
    let last = 0;
    let match: RegExpExecArray | null;

    const pushText = (end: number) => {
        if (end > last) tokens.push({ type: 'text', value: text.slice(last, end) });
    };

    INLINE_PATTERN.lastIndex = 0;
    while ((match = INLINE_PATTERN.exec(text)) !== null) {
        const [whole, label, labelUrl, bold, italic, strike, bareUrl] = match;

        if (bareUrl !== undefined) {
            const url = trimTrailingNoise(bareUrl);
            const reachesEnd = match.index + whole.length === text.length;
            // A skipped match stays inside the surrounding text run: `last` is left untouched, and
            // the regex has already advanced past it so it isn't reconsidered.
            if (!isLinkable(url) || (dropTrailingUrl && reachesEnd)) continue;
            pushText(match.index);
            tokens.push({ type: 'url', value: url });
            last = match.index + url.length;
            continue;
        }

        pushText(match.index);
        if (label !== undefined && labelUrl !== undefined) {
            tokens.push({ type: 'url', value: labelUrl, label });
        } else if (bold !== undefined) {
            tokens.push({ type: 'bold', value: bold.slice(2, -2) });
        } else if (italic !== undefined) {
            tokens.push({ type: 'italic', value: italic.slice(1, -1) });
        } else if (strike !== undefined) {
            tokens.push({ type: 'strike', value: strike.slice(2, -2) });
        }
        last = match.index + whole.length;
    }

    pushText(text.length);
    return tokens;
};

/** Pass 3 — inline backticks, then hand the leftovers to the links-and-marks pass. */
const tokenizeInline = (text: string, dropTrailingUrl: boolean): InlineToken[] => {
    const tokens: InlineToken[] = [];
    let last = 0;
    let match: RegExpExecArray | null;

    const pushText = (value: string, isFinal: boolean) => {
        if (value) tokens.push(...tokenizeMarks(value, dropTrailingUrl && isFinal));
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

/**
 * Pass 2 — group consecutive `> ` lines into quotes; every other line flows on as text.
 *
 * The line break between a quote and its neighbours is dropped, because the quote is its own block
 * and already ends the line.
 */
const tokenizeQuotes = (text: string, dropTrailingUrl: boolean): MessageToken[] => {
    const groups: { quote: boolean; lines: string[] }[] = [];
    for (const line of text.split('\n')) {
        const quoted = QUOTE_LINE_PATTERN.exec(line);
        const value = quoted ? (quoted[1] ?? '') : line;
        const current = groups[groups.length - 1];
        if (current && current.quote === !!quoted) current.lines.push(value);
        else groups.push({ quote: !!quoted, lines: [value] });
    }

    return groups.flatMap((group, index): MessageToken[] => {
        // Only the run at the very end can hold a URL cut by truncation.
        const inline = tokenizeInline(group.lines.join('\n'), dropTrailingUrl && index === groups.length - 1);
        return group.quote ? [{ type: 'quote', children: inline }] : inline;
    });
};

export const tokenizeMessage = (text: string, options?: TokenizeOptions): MessageToken[] => {
    if (!text) return [];

    const dropTrailingUrl = options?.truncated === true;
    const segments = splitFences(text, dropTrailingUrl || options?.closeDanglingFence === true);

    return segments.flatMap((segment, index) => {
        if (segment.type === 'codeBlock') return [segment];
        // Only a URL at the very end of the whole message can be a truncation fragment.
        const isFinal = index === segments.length - 1;
        return tokenizeQuotes(segment.value, dropTrailingUrl && isFinal);
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
export const extractFirstUrl = (text: string, closeDanglingFence = false): string | undefined => {
    for (const token of tokenizeMessage(text, { closeDanglingFence })) {
        const url = (token.type === 'quote' ? token.children : [token]).find(child => child.type === 'url');
        if (url?.type === 'url') return url.value;
    }
    return undefined;
};

/** Pasted code often starts with a blank line, and a row previewing "" reads as an empty channel. */
const firstNonEmptyLine = (value: string): string => value.split('\n').find(line => line.trim() !== '') ?? '';

const plainOf = (token: InlineToken): string => (token.type === 'url' ? (token.label ?? token.value) : token.value);

/** A fence or a quote: drawn as its own box, so it took the line breaks around it with it. */
const isBlock = (token: MessageToken | undefined): boolean => token?.type === 'codeBlock' || token?.type === 'quote';

/**
 * Markup dropped, words kept: a labelled link reads as its words, code loses its backticks, a mark
 * loses its markers and a quote its `>`.
 *
 * A block takes the line breaks around it with it, so where one meets text with no whitespace left
 * between them a line break goes back in — otherwise `참고\n```…` would read `참고nx build`, and a
 * quote would run into the line before it.
 */
const flatten = (text: string, codeBlock: (value: string) => string): string => {
    const tokens = tokenizeMessage(text);
    return tokens.reduce((plain, token, index) => {
        const piece =
            token.type === 'codeBlock'
                ? codeBlock(token.value)
                : token.type === 'quote'
                  ? token.children.map(plainOf).join('')
                  : plainOf(token);
        const meetsBlock = isBlock(token) || isBlock(tokens[index - 1]);
        const needsBreak = meetsBlock && !!plain && !!piece && !/\s$/.test(plain) && !/^\s/.test(piece);
        return plain + (needsBreak ? '\n' : '') + piece;
    }, '');
};

/**
 * Message text flattened for a one-line preview (the home list).
 *
 * The home row has nowhere to render a code block, so markup characters would just read as noise
 * there. Backticks and mark markers are stripped, a quote loses its `>` and a fenced block
 * collapses to its first line — no badge, no monospace, nothing that would complicate the row or
 * tangle with the blur-preview setting. A labelled link reads as its words.
 */
export const toPlainPreview = (text: string): string => flatten(text, firstNonEmptyLine);

/**
 * Message text flattened like `toPlainPreview`, but with every line of a fenced block kept.
 *
 * For a surface that searches inside what it shows — a search result highlights the query in it,
 * and a match on the third line of a code block has to survive the flattening to be found there.
 */
export const toPlainText = (text: string): string => flatten(text, value => value);
