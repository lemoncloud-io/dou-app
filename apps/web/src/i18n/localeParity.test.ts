import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES_DIR = join(__dirname, '../../public/locales');

type Tree = { [key: string]: string | Tree };

const readLocale = (lang: string): Tree =>
    JSON.parse(readFileSync(join(LOCALES_DIR, lang, 'translation.json'), 'utf-8')) as Tree;

const leafKeys = (tree: Tree, prefix = ''): string[] =>
    Object.entries(tree).flatMap(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return typeof value === 'object' && value !== null ? leafKeys(value, path) : [path];
    });

describe('i18n 로케일 정합성', () => {
    const ko = leafKeys(readLocale('ko'));
    const en = leafKeys(readLocale('en'));

    it('ko와 en의 키 집합이 완전히 같다', () => {
        expect(en.filter(key => !ko.includes(key)).sort()).toEqual([]);
        expect(ko.filter(key => !en.includes(key)).sort()).toEqual([]);
    });

    it('어느 쪽에도 빈 문자열 값이 없다 — 빈 라벨은 누락과 구분되지 않는다', () => {
        const empties = (['ko', 'en'] as const).flatMap(lang => {
            const tree = readLocale(lang);
            return leafKeys(tree)
                .filter(key => key.split('.').reduce<unknown>((node, part) => (node as Tree)?.[part], tree) === '')
                .map(key => `${lang}:${key}`);
        });
        expect(empties).toEqual([]);
    });
});
