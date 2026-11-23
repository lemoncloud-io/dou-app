type Messages = { [key: string]: string | Messages };

const files = import.meta.glob<Messages>('./locales/**/*.json', { eager: true, import: 'default' });

const flatten = (messages: Messages, prefix = ''): string[] =>
    Object.entries(messages).flatMap(([key, value]) =>
        typeof value === 'string' ? [`${prefix}${key}`] : flatten(value, `${prefix}${key}.`)
    );

const pairs = Object.keys(files)
    .filter(path => path.endsWith('/ko.json'))
    .map(ko => [ko.replace(/ko\.json$/, ''), ko, ko.replace(/ko\.json$/, 'en.json')] as const);

describe('locale parity', () => {
    it('finds every language file a pair', () => {
        expect(pairs.length).toBeGreaterThan(0);
        for (const path of Object.keys(files)) {
            expect(path).toMatch(/\/(ko|en)\.json$/);
            const sibling = path.replace(/(ko|en)\.json$/, m => (m === 'ko.json' ? 'en.json' : 'ko.json'));
            expect(files[sibling], `${path} has no ${sibling}`).toBeDefined();
        }
    });

    it.each(pairs)('%s has the same keys in ko and en', (_dir, ko, en) => {
        expect(flatten(files[en]).sort()).toEqual(flatten(files[ko]).sort());
    });
});
