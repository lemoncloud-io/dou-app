export type FenceSegment = { type: 'text'; value: string } | { type: 'code'; value: string; lang?: string };

/** A bare language tag directly after the opening fence, on its own line (```` ```sh⏎ ````). */
const LANG_LINE = /^([A-Za-z0-9_+#-]+)[ \t]*\r?\n/;

/**
 * Splits a message into fenced code blocks and the text between them — the one rule for what a
 * fence is, used by the message view and by the composer's paste so the two cannot disagree.
 *
 * A fence opens with a run of three or more backticks anywhere in the text and closes at the next
 * run at least as long, which it consumes whole. Matching the run length is what lets a block hold
 * ```` ``` ```` itself: the composer lengthens the fence around such code to four, and pairing on
 * three cut that block short and left a backtick on each side of it. A bare word right after the
 * opening fence is the language tag, not code — other clients write ```` ```sh ````, and showing
 * `sh` as the first line of the command was the other half of the same report. An opening run with
 * no closing one is just backticks someone typed, so it stays text.
 */
export const splitFences = (text: string): FenceSegment[] => {
    const segments: FenceSegment[] = [];
    let buffer = '';
    let index = 0;

    while (index < text.length) {
        const open = text.indexOf('```', index);
        if (open === -1) break;
        let bodyStart = open;
        while (text[bodyStart] === '`') bodyStart += 1;
        const fenceLength = bodyStart - open;

        let close = -1;
        let closeEnd = -1;
        for (let at = text.indexOf('`', bodyStart); at !== -1; at = text.indexOf('`', closeEnd)) {
            closeEnd = at;
            while (text[closeEnd] === '`') closeEnd += 1;
            if (closeEnd - at >= fenceLength) {
                close = at;
                break;
            }
        }

        if (close === -1) {
            buffer += text.slice(index, bodyStart);
            index = bodyStart;
            continue;
        }

        buffer += text.slice(index, open);
        if (buffer) segments.push({ type: 'text', value: buffer });
        buffer = '';

        let body = text.slice(bodyStart, close);
        const lang = LANG_LINE.exec(body)?.[1];
        if (lang) body = body.slice(body.indexOf('\n'));
        body = body.replace(/^\n/, '').replace(/\n$/, '');
        segments.push(lang ? { type: 'code', value: body, lang } : { type: 'code', value: body });
        index = closeEnd;
    }

    buffer += text.slice(index);
    if (buffer) segments.push({ type: 'text', value: buffer });
    return segments;
};
