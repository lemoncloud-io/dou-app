export type InlineToken =
    | { type: 'text'; value: string }
    | { type: 'url'; value: string; label?: string }
    | { type: 'code'; value: string }
    | { type: 'bold' | 'italic' | 'strike'; children: InlineToken[] };

export type MessageToken =
    | InlineToken
    | { type: 'codeBlock'; value: string; lang?: string }
    | { type: 'quote'; children: InlineToken[] };

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

const LABELLED_LINK_PATTERN = /\[([^[\]\n]+)\]\((https?:\/\/[^\s()/?#][^\s()]*)\)/g;

const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', "'", '"', '·', '…']);

const BRACKET_PAIRS = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
] as const;

const FENCE = '```';
const LANG_PATTERN = /^[A-Za-z0-9_+#-]*$/;
const INLINE_CODE_PATTERN = /`([^`\n]+)`/g;
const QUOTE_LINE_PATTERN = /^>(?:\s(.*))?$/;

const INLINE_PATTERN = new RegExp(
    `${LABELLED_LINK_PATTERN.source}|\\*\\*((?:[^*\\n]|\\*[^*\\n]+\\*)+)\\*\\*|\\*((?:[^*\\n]|\\*\\*[^*\\n]+\\*\\*)+)\\*|~~([^~\\n]+)~~|(${URL_PATTERN.source})`,
    'g'
);

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

const isLinkable = (url: string): boolean => /^https?:\/\/[^\s/?#]/i.test(url);

export interface TokenizeOptions {
    truncated?: boolean;
    closeDanglingFence?: boolean;
}

const splitFenceBody = (body: string): { lang?: string; value: string } => {
    const newline = body.indexOf('\n');
    if (newline === -1) return { value: body };

    const info = body.slice(0, newline).trim();
    if (!LANG_PATTERN.test(info)) return { value: body };
    return { lang: info || undefined, value: body.slice(newline + 1) };
};

const trimFenceEdges = (value: string): string => value.replace(/\n$/, '');

type Segment = { type: 'text'; value: string } | Extract<MessageToken, { type: 'codeBlock' }>;

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

        const flushBeforeFence = () => {
            if (buffer.endsWith('\n')) buffer = buffer.slice(0, -1);
            flush();
        };

        if (!close) {
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

const tokenizeMarks = (text: string, dropTrailingUrl: boolean, insideMark = false): InlineToken[] => {
    const tokens: InlineToken[] = [];
    let last = 0;

    const pushText = (end: number) => {
        if (end > last) tokens.push({ type: 'text', value: text.slice(last, end) });
    };

    for (const match of text.matchAll(INLINE_PATTERN)) {
        const [whole, label, labelUrl, bold, italic, strike, bareUrl] = match;

        if (insideMark && bold === undefined && italic === undefined && strike === undefined) continue;

        if (bareUrl !== undefined) {
            const url = trimTrailingNoise(bareUrl);
            const reachesEnd = match.index + whole.length === text.length;
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
            tokens.push({ type: 'bold', children: tokenizeMarks(bold, false, true) });
        } else if (italic !== undefined) {
            tokens.push({ type: 'italic', children: tokenizeMarks(italic, false, true) });
        } else if (strike !== undefined) {
            tokens.push({ type: 'strike', children: tokenizeMarks(strike, false, true) });
        }
        last = match.index + whole.length;
    }

    pushText(text.length);
    return tokens;
};

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
        const isFinal = index === segments.length - 1;
        return tokenizeQuotes(segment.value, dropTrailingUrl && isFinal);
    });
};

export const extractFirstUrl = (text: string, closeDanglingFence = false): string | undefined => {
    for (const token of tokenizeMessage(text, { closeDanglingFence })) {
        const url = (token.type === 'quote' ? token.children : [token]).find(child => child.type === 'url');
        if (url?.type === 'url') return url.value;
    }
    return undefined;
};

const firstNonEmptyLine = (value: string): string => value.split('\n').find(line => line.trim() !== '') ?? '';

const plainOf = (token: InlineToken): string => {
    switch (token.type) {
        case 'url':
            return token.label ?? token.value;
        case 'bold':
        case 'italic':
        case 'strike':
            return token.children.map(plainOf).join('');
        default:
            return token.value;
    }
};

const isBlock = (token: MessageToken | undefined): boolean => token?.type === 'codeBlock' || token?.type === 'quote';

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

export const toPlainPreview = (text: string): string => flatten(text, firstNonEmptyLine);

export const toPlainText = (text: string): string => flatten(text, value => value);
