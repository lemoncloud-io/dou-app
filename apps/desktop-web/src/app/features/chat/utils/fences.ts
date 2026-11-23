export type FenceSegment = { type: 'text'; value: string } | { type: 'code'; value: string; lang?: string };

const LANG_LINE = /^([A-Za-z0-9_+#-]+)[ \t]*\r?\n/;

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
        body = body.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
        segments.push(lang ? { type: 'code', value: body, lang } : { type: 'code', value: body });
        index = closeEnd;
    }

    buffer += text.slice(index);
    if (buffer) segments.push({ type: 'text', value: buffer });
    return segments;
};
