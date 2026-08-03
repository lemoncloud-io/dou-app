import { extractFirstUrl, tokenizeLinks } from './linkTokens';

const urls = (text: string, truncated = false) =>
    tokenizeLinks(text, { dropTrailingUrl: truncated })
        .filter(token => token.type === 'url')
        .map(token => token.value);

describe('tokenizeLinks', () => {
    it('returns nothing for empty text', () => {
        expect(tokenizeLinks('')).toEqual([]);
    });

    it('keeps text without URLs as a single run', () => {
        expect(tokenizeLinks('안녕하세요 반갑습니다')).toEqual([{ type: 'text', value: '안녕하세요 반갑습니다' }]);
    });

    it('splits a URL out of the surrounding text', () => {
        expect(tokenizeLinks('보세요 https://example.com/a 여기요')).toEqual([
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
        expect(tokenizeLinks('보세요 https://example.com/a.')).toEqual([
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
        expect(tokenizeLinks('https://.')).toEqual([{ type: 'text', value: 'https://.' }]);
    });

    it('does not match across whitespace or quotes', () => {
        expect(urls('"https://example.com/a" <https://example.com/b>')).toEqual([
            'https://example.com/a',
            'https://example.com/b',
        ]);
    });

    describe('dropTrailingUrl', () => {
        it('leaves a URL that runs to the end of a truncated string as text', () => {
            const cut = '보세요 https://example.com/very/long/pa';
            expect(urls(cut, true)).toEqual([]);
            expect(tokenizeLinks(cut, { dropTrailingUrl: true })).toEqual([{ type: 'text', value: cut }]);
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
