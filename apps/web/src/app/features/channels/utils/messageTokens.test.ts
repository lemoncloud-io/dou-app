import { extractFirstUrl, toPlainPreview, toPlainText, tokenizeMessage } from './messageTokens';

const urls = (text: string, truncated = false) =>
    tokenizeMessage(text, { truncated })
        .filter(token => token.type === 'url')
        .map(token => token.value);

describe('tokenizeMessage', () => {
    it('returns nothing for empty text', () => {
        expect(tokenizeMessage('')).toEqual([]);
    });

    it('keeps text without URLs as a single run', () => {
        expect(tokenizeMessage('안녕하세요 반갑습니다')).toEqual([{ type: 'text', value: '안녕하세요 반갑습니다' }]);
    });

    it('splits a URL out of the surrounding text', () => {
        expect(tokenizeMessage('보세요 https://example.com/a 여기요')).toEqual([
            { type: 'text', value: '보세요 ' },
            { type: 'url', value: 'https://example.com/a' },
            { type: 'text', value: ' 여기요' },
        ]);
    });

    it('finds every URL in the message', () => {
        expect(urls('a https://one.com b http://two.com/x c')).toEqual(['https://one.com', 'http://two.com/x']);
    });

    it('matches http as well as https', () => {
        expect(urls('http://example.com')).toEqual(['http://example.com']);
    });

    it('does not match a bare domain without a scheme', () => {
        expect(urls('example.com/a and www.example.com')).toEqual([]);
    });

    it.each([
        ['https://example.com/a.', 'https://example.com/a'],
        ['https://example.com/a,', 'https://example.com/a'],
        ['https://example.com/a!!', 'https://example.com/a'],
        ['https://example.com/a?', 'https://example.com/a'],
        ['https://example.com/a…', 'https://example.com/a'],
    ])('strips trailing sentence punctuation from %s', (input, expected) => {
        expect(urls(`보세요 ${input}`)).toEqual([expected]);
    });

    it('returns stripped punctuation to the text run', () => {
        expect(tokenizeMessage('보세요 https://example.com/a.')).toEqual([
            { type: 'text', value: '보세요 ' },
            { type: 'url', value: 'https://example.com/a' },
            { type: 'text', value: '.' },
        ]);
    });

    it('drops an unbalanced closing bracket but keeps a balanced one', () => {
        expect(urls('(참고 https://example.com/a)')).toEqual(['https://example.com/a']);
        expect(urls('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual(['https://en.wikipedia.org/wiki/Foo_(bar)']);
    });

    it('repeats trimming until stable', () => {
        expect(urls('보세요 https://example.com/a).')).toEqual(['https://example.com/a']);
    });

    it('ignores a URL left unusable after trimming', () => {
        expect(urls('https://.')).toEqual([]);
        expect(tokenizeMessage('https://.')).toEqual([{ type: 'text', value: 'https://.' }]);
    });

    it('does not match across whitespace or quotes', () => {
        expect(urls('"https://example.com/a" <https://example.com/b>')).toEqual([
            'https://example.com/a',
            'https://example.com/b',
        ]);
    });

    describe('truncated', () => {
        it('leaves a URL that runs to the end of a truncated string as text', () => {
            const cut = '보세요 https://example.com/very/long/pa';
            expect(urls(cut, true)).toEqual([]);
            expect(tokenizeMessage(cut, { truncated: true })).toEqual([{ type: 'text', value: cut }]);
        });

        it('still links earlier URLs in the same truncated string', () => {
            const cut = 'a https://one.com b https://two.com/cut';
            expect(urls(cut, true)).toEqual(['https://one.com']);
        });

        it('links the trailing URL when the text was not truncated', () => {
            expect(urls('보세요 https://example.com/a')).toEqual(['https://example.com/a']);
        });

        it('keeps a trailing URL followed by other characters', () => {
            expect(urls('보세요 https://example.com/a 끝', true)).toEqual(['https://example.com/a']);
        });
    });
});

describe('extractFirstUrl', () => {
    it('returns the first URL', () => {
        expect(extractFirstUrl('a https://one.com b https://two.com')).toBe('https://one.com');
    });

    it('returns undefined when there is none', () => {
        expect(extractFirstUrl('링크 없는 메시지')).toBeUndefined();
    });

    it('applies the same trimming as the rendered link, so the cache key matches the href', () => {
        expect(extractFirstUrl('보세요 https://example.com/a.')).toBe('https://example.com/a');
    });

    it('finds a URL past the bubble truncation point', () => {
        const long = `${'가'.repeat(250)} https://example.com/late`;
        expect(extractFirstUrl(long)).toBe('https://example.com/late');
    });
});

describe('inline code', () => {
    it('splits a backtick pair out of the surrounding text', () => {
        expect(tokenizeMessage('배포는 `yarn deploy` 로')).toEqual([
            { type: 'text', value: '배포는 ' },
            { type: 'code', value: 'yarn deploy' },
            { type: 'text', value: ' 로' },
        ]);
    });

    it('finds every pair in the message', () => {
        expect(tokenizeMessage('`a` and `b`').filter(t => t.type === 'code')).toEqual([
            { type: 'code', value: 'a' },
            { type: 'code', value: 'b' },
        ]);
    });

    // Retroactive rule: old messages that used a backtick as punctuation must not turn into code.
    it('leaves an unclosed backtick as plain text', () => {
        expect(tokenizeMessage('이건 `중요해요')).toEqual([{ type: 'text', value: '이건 `중요해요' }]);
    });

    it('does not let a pair span a line break', () => {
        expect(tokenizeMessage('`시작\n끝`')).toEqual([{ type: 'text', value: '`시작\n끝`' }]);
    });

    it('ignores an empty pair', () => {
        expect(tokenizeMessage('``')).toEqual([{ type: 'text', value: '``' }]);
    });
});

describe('fenced code blocks', () => {
    it('parses the language tag and keeps the body', () => {
        expect(tokenizeMessage('```ts\nconst x = 1;\n```')).toEqual([
            { type: 'codeBlock', value: 'const x = 1;', lang: 'ts' },
        ]);
    });

    it('has no lang when the fence carries none', () => {
        expect(tokenizeMessage('```\nconst x = 1;\n```')).toEqual([
            { type: 'codeBlock', value: 'const x = 1;', lang: undefined },
        ]);
    });

    it('preserves interior line breaks', () => {
        const [token] = tokenizeMessage('```\na\nb\n```');
        expect(token).toEqual({ type: 'codeBlock', value: 'a\nb', lang: undefined });
    });

    // The newline ending each fence line belongs to the fence. Leaving it in the text runs stacked
    // a blank line above and below every block, since the bubble renders whitespace-pre-wrap and
    // the block is already its own box (measured: one extra line box in Chrome).
    it('keeps the surrounding text as its own runs, without the fence line breaks', () => {
        expect(tokenizeMessage('보세요:\n```\ncode\n```\n끝')).toEqual([
            { type: 'text', value: '보세요:' },
            { type: 'codeBlock', value: 'code', lang: undefined },
            { type: 'text', value: '끝' },
        ]);
    });

    it('handles a single-line fence', () => {
        expect(tokenizeMessage('```code```')).toEqual([{ type: 'codeBlock', value: 'code', lang: undefined }]);
    });

    it('leaves an unterminated fence as plain text', () => {
        expect(tokenizeMessage('```ts\nconst x = 1;')).toEqual([{ type: 'text', value: '```ts\nconst x = 1;' }]);
    });

    // The closing fence is on the other side of the cut, so honour the block rather than showing
    // three stray backticks in the bubble. The full text is still available in the expand dialog.
    it('treats a fence left open by truncation as closed', () => {
        expect(tokenizeMessage('```ts\nconst x = 1;', { truncated: true })).toEqual([
            { type: 'codeBlock', value: 'const x = 1;', lang: 'ts' },
        ]);
    });

    it('a first line that is not a bare language tag is code, not an info string', () => {
        expect(tokenizeMessage('```\nconst x = fetch(1);\n```')).toEqual([
            { type: 'codeBlock', value: 'const x = fetch(1);', lang: undefined },
        ]);
    });
});

// A fence closes at the next backtick run at least as long as the one that opened it, as on desktop.
// The desktop composer wraps code holding ``` in four backticks; closing at the next three cut such a
// block short and spilled the rest of it out as text.
describe('fence run length', () => {
    it('pairs a four-backtick fence with its own closing run, keeping the ``` inside as code', () => {
        expect(tokenizeMessage('````\nuse ```js\n````')).toEqual([
            { type: 'codeBlock', value: 'use ```js', lang: undefined },
        ]);
    });

    it('keeps shorter backtick runs inside a longer fence as code', () => {
        expect(tokenizeMessage('before\n````\na ``` b `` c\n````\nafter')).toEqual([
            { type: 'text', value: 'before' },
            { type: 'codeBlock', value: 'a ``` b `` c', lang: undefined },
            { type: 'text', value: 'after' },
        ]);
    });

    it('lets a longer closing run close the block and consumes all of it', () => {
        expect(tokenizeMessage('```code`````')).toEqual([{ type: 'codeBlock', value: 'code', lang: undefined }]);
    });

    it('still reads the language tag after a longer opening run', () => {
        expect(tokenizeMessage('````md\n```js\nx\n```\n````')).toEqual([
            { type: 'codeBlock', value: '```js\nx\n```', lang: 'md' },
        ]);
    });

    it('leaves an unterminated longer fence as plain text, every backtick of it', () => {
        expect(tokenizeMessage('````\nuse ```js')).toEqual([{ type: 'text', value: '````\nuse ```js' }]);
    });

    it('closes an unterminated longer fence at the cut without stopping at a shorter run inside it', () => {
        expect(tokenizeMessage('````\nuse ```js', { truncated: true })).toEqual([
            { type: 'codeBlock', value: 'use ```js', lang: undefined },
        ]);
    });

    it('keeps a URL after an inner ``` inside the block, for the bubble and the unfurl alike', () => {
        const text = '````\nsee ```\nhttps://inside.example.com/x\n````';
        expect(urls(text)).toEqual([]);
        expect(extractFirstUrl(text)).toBeUndefined();
    });

    it('previews a four-backtick block by its first line', () => {
        expect(toPlainPreview('````\nuse ```js\n````')).toBe('use ```js');
    });
});

// The ordering guarantee: code is resolved first, so URLs inside it never become links.
describe('code wins over URLs', () => {
    it('does not link a URL inside a fenced block', () => {
        const tokens = tokenizeMessage("```ts\nfetch('https://api.example.com');\n```");
        expect(tokens.some(t => t.type === 'url')).toBe(false);
        expect(tokens[0]).toMatchObject({ type: 'codeBlock' });
    });

    it('does not link a URL inside inline code', () => {
        const tokens = tokenizeMessage('`https://api.example.com` 를 부른다');
        expect(tokens.some(t => t.type === 'url')).toBe(false);
    });

    it('still links a URL outside the code', () => {
        const tokens = tokenizeMessage('```\ncode\n```\n참고 https://example.com/a');
        expect(tokens.filter(t => t.type === 'url')).toEqual([{ type: 'url', value: 'https://example.com/a' }]);
    });

    it('extractFirstUrl skips code and finds the first real URL', () => {
        expect(extractFirstUrl("```\nfetch('https://inside.example.com')\n```\n밖 https://outside.example.com")).toBe(
            'https://outside.example.com'
        );
    });

    it('extractFirstUrl returns undefined when the only URL is in code', () => {
        expect(extractFirstUrl('`https://inside.example.com`')).toBeUndefined();
    });

    it('tokenizes a message mixing text, fence, inline code and a URL in order', () => {
        const tokens = tokenizeMessage('먼저 https://a.com\n```ts\nx\n```\n그리고 `npm i`');
        // No text run between the URL and the fence: it held only the newline the fence consumes.
        expect(tokens.map(t => t.type)).toEqual(['text', 'url', 'codeBlock', 'text', 'code']);
    });
});

describe('toPlainPreview', () => {
    it('strips inline backticks', () => {
        expect(toPlainPreview('배포는 `yarn deploy` 로')).toBe('배포는 yarn deploy 로');
    });

    it('collapses a fenced block to its first line', () => {
        expect(toPlainPreview('```ts\nconst x = 1;\nconst y = 2;\n```')).toBe('const x = 1;');
    });

    it('does not glue the text before a fenced block onto its first line', () => {
        expect(toPlainPreview('참고\n```sh\nnx build web\nnx deploy web\n```')).toBe('참고\nnx build web');
    });

    it('leaves ordinary text untouched', () => {
        expect(toPlainPreview('안녕하세요 https://example.com/a')).toBe('안녕하세요 https://example.com/a');
    });

    it('keeps an unclosed backtick, since it is not code', () => {
        expect(toPlainPreview('이건 `중요해요')).toBe('이건 `중요해요');
    });

    it('returns an empty string for empty input', () => {
        expect(toPlainPreview('')).toBe('');
    });
});

describe('toPlainText', () => {
    // The search row highlights inside this, so a match on a fence's later lines must survive.
    it('keeps every line of a fenced block', () => {
        expect(toPlainText('```ts\nconst x = 1;\nconst y = 2;\n```')).toBe('const x = 1;\nconst y = 2;');
    });

    // The fence swallows the line breaks around it; without one put back, words run into the code.
    it('keeps a fenced block on its own line beside text', () => {
        expect(toPlainText('앞\n```\nb\n```\n뒤')).toBe('앞\nb\n뒤');
        expect(toPlainText('```\nb\n```\n```\nd\n```')).toBe('b\nd');
    });

    it('adds no break where an inline fence already has spaces around it', () => {
        expect(toPlainText('a ```b``` c')).toBe('a b c');
    });

    it('drops markup the same way toPlainPreview does', () => {
        expect(toPlainText('배포는 `yarn deploy` 로, [가이드](https://example.com/a) 참고')).toBe(
            '배포는 yarn deploy 로, 가이드 참고'
        );
    });

    it('returns an empty string for empty input', () => {
        expect(toPlainText('')).toBe('');
    });
});

// Message content is chosen by whoever sends it, and the home list now tokenizes the full last
// message of every channel — so a pathological string must not be able to hang the main thread.
describe('adversarial input', () => {
    const budgetMs = 300;

    it('trims a long punctuation run in linear time', () => {
        const started = Date.now();
        toPlainPreview(`https://a${'.'.repeat(60_000)}x`);
        expect(Date.now() - started).toBeLessThan(budgetMs);
    });

    it('trims a long alternating bracket/punctuation run in linear time', () => {
        const started = Date.now();
        toPlainPreview(`https://a${').'.repeat(20_000)}`);
        expect(Date.now() - started).toBeLessThan(budgetMs);
    });

    // Every opening run that finds no closing one scans the rest of the message. Such runs can only
    // get shorter as the message goes on — a later run as long would have closed the earlier one — so
    // a message of strictly shrinking runs is the worst case: about √(2n) scans of the remainder.
    it('rejects a long series of ever-shorter unclosed fences within budget', () => {
        const runs = Array.from({ length: 344 }, (_, index) => '`'.repeat(346 - index)).join('a');
        const started = Date.now();
        toPlainPreview(runs);
        expect(Date.now() - started).toBeLessThan(budgetMs);
    });

    it('still trims correctly after the rewrite', () => {
        expect(extractFirstUrl('보세요 https://example.com/a...')).toBe('https://example.com/a');
        expect(extractFirstUrl('(see https://example.com/a)')).toBe('https://example.com/a');
        expect(extractFirstUrl('https://en.wikipedia.org/wiki/Foo_(bar)')).toBe(
            'https://en.wikipedia.org/wiki/Foo_(bar)'
        );
    });
});

describe('extractFirstUrl and the bubble agree about code', () => {
    // A message over the bubble cap whose fence never closes: the bubble treats the dangling fence
    // as closed and renders the URL as code, so the card must not appear either.
    it('skips a URL under a fence the bubble closes at the cut', () => {
        const text = `\`\`\`\n${'가'.repeat(250)} https://inside.example.com/x`;
        expect(extractFirstUrl(text, true)).toBeUndefined();
        expect(extractFirstUrl(text, false)).toBe('https://inside.example.com/x');
    });

    // Closing a dangling fence must not also drop a trailing URL — the card exists precisely to
    // reach a link the bubble had to cut.
    it('still finds a trailing URL past the truncation point', () => {
        const long = `${'가'.repeat(250)} https://example.com/late`;
        expect(extractFirstUrl(long, true)).toBe('https://example.com/late');
    });
});

describe('toPlainPreview — blank leading line', () => {
    it('takes the first non-empty line of a block', () => {
        expect(toPlainPreview('```\n\nhello\n```')).toBe('hello');
    });

    it('returns empty for a block with no content', () => {
        expect(toPlainPreview('```\n```')).toBe('');
    });
});

describe('labelled links', () => {
    it('reads [label](url) as one link carrying its label', () => {
        expect(tokenizeMessage('see [the docs](https://example.com/a) here')).toEqual([
            { type: 'text', value: 'see ' },
            { type: 'url', value: 'https://example.com/a', label: 'the docs' },
            { type: 'text', value: ' here' },
        ]);
    });

    it('leaves a label pointing anywhere but http(s) as text', () => {
        expect(urls('[x](javascript:alert(1))')).toEqual([]);
    });

    it('reads a labelled link with no host as text, as the desktop reader does', () => {
        expect(urls('[x](https:///a)')).toEqual([]);
    });

    it('keeps a labelled link inside code literal', () => {
        expect(urls('`[x](https://example.com)`')).toEqual([]);
    });

    it('unfurls the address and previews the label', () => {
        expect(extractFirstUrl('[the docs](https://example.com/a)')).toBe('https://example.com/a');
        expect(toPlainPreview('see [the docs](https://example.com/a)')).toBe('see the docs');
    });
});
