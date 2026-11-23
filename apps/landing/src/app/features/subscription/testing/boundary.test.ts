const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', { eager: true, query: '?raw', import: 'default' });

const isTest = (path: string) => /\.test\.tsx?$/.test(path) || path.includes('/testing/');

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\(\s*|vi\.mock\(\s*)['"]([^'"]+)['"]/g;

const specifiersOf = (source: string): string[] => [...source.matchAll(IMPORT)].map(match => match[1]);

describe('testing/ boundary', () => {
    it('reads the app sources', () => {
        expect(Object.keys(sources).some(path => path.endsWith('/routes/index.tsx'))).toBe(true);
    });

    it('sees every form an import takes', () => {
        const source = [
            "import { a } from './a';",
            "import './b';",
            "const c = import('./c');",
            "const d = require('./d');",
            "vi.mock('./e');",
            "export { f } from './f';",
        ].join('\n');
        expect(specifiersOf(source)).toEqual(['./a', './b', './c', './d', './e', './f']);
    });

    it('is imported by tests alone', () => {
        const offenders = Object.entries(sources)
            .filter(([path]) => !isTest(path))
            .flatMap(([path, source]) =>
                specifiersOf(source)
                    .filter(specifier => /(^|\/)testing(\/|$)/.test(specifier))
                    .map(specifier => `${path} → ${specifier}`)
            );
        expect(offenders).toEqual([]);
    });
});
