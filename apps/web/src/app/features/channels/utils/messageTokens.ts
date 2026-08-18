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
 * Drops characters that the greedy match swallowed but that aren't part of the address:
 * `자세히는 https://example.com/a.` must link to `/a`, not `/a.`.
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

/** Pass 1 — carve out fenced blocks, leaving everything else as raw text to look at later. */
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

        const bodyStart = index + FENCE.length;
        const close = text.indexOf(FENCE, bodyStart);

        // The newline that ends the line the fence sits on belongs to the fence, not to the text
        // around it. The bubble renders with `whitespace-pre-wrap` and the block is already its own
        // box, so leaving it in stacks a blank line above (and below) every block.
        const flushBeforeFence = () => {
            if (buffer.endsWith('\n')) buffer = buffer.slice(0, -1);
            flush();
        };

        if (close === -1) {
            // Unterminated. When the text was cut, the closing fence is beyond the cut, so honour
            // the block; otherwise the user simply typed three backticks — leave them as text.
            if (!closeDanglingFence) {
                buffer += FENCE;
                index = bodyStart;
                continue;
            }
            const { lang, value } = splitFenceBody(text.slice(bodyStart));
            flushBeforeFence();
            segments.push({ type: 'codeBlock', value: trimFenceEdges(value), lang });
            return segments;
        }

        const { lang, value } = splitFenceBody(text.slice(bodyStart, close));
        flushBeforeFence();
        segments.push({ type: 'codeBlock', value: trimFenceEdges(value), lang });
        index = close + FENCE.length;
        if (text[index] === '\n') index += 1;
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

    const dropTrailingUrl = options?.truncated === true;
    const segments = splitFences(text, dropTrailingUrl || options?.closeDanglingFence === true);

    return segments.flatMap((segment, index) => {
        if (segment.type === 'codeBlock') return [segment];
        // Only a URL at the very end of the whole message can be a truncation fragment.
        const isFinal = index === segments.length - 1;
        return tokenizeInline(segment.value, dropTrailingUrl && isFinal);
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
export const extractFirstUrl = (text: string, closeDanglingFence = false): string | undefined =>
    tokenizeMessage(text, { closeDanglingFence }).find(token => token.type === 'url')?.value;

/** Pasted code often starts with a blank line, and a row previewing "" reads as an empty channel. */
const firstNonEmptyLine = (value: string): string => value.split('\n').find(line => line.trim() !== '') ?? '';

/**
 * Message text flattened for a one-line preview (the home list).
 *
 * The home row has nowhere to render a code block, so markup characters would just read as noise
 * there. Backticks are stripped and a fenced block collapses to its first line — no badge, no
 * monospace, nothing that would complicate the row or tangle with the blur-preview setting.
 */
export const toPlainPreview = (text: string): string =>
    tokenizeMessage(text)
        .map(token => (token.type === 'codeBlock' ? firstNonEmptyLine(token.value) : token.value))
        .join('');
