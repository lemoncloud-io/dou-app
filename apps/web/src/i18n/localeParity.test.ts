import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Locale files must carry the same keys.
 *
 * `fallbackLng` is `en` (see ./index.ts), which makes the two directions fail very differently: a key
 * missing from `ko` quietly falls back to English, but a key missing from `en` has nowhere to fall
 * back to and i18next renders the KEY ITSELF. That shipped once — `contactInvite.reinvite.pending.confirm`
 * existed only in ko, so the reinvite dialog's confirm button read
 * "contactInvite.reinvite.pending.confirm", and because the raw key is one long unbroken token it also
 * blew the two-up button row 52px past the dialog (measured), cutting the label off.
 *
 * Neither compiler nor lint can see this — `t('some.key')` is just a string — so it is asserted here.
 */
const LOCALES_DIR = join(__dirname, '../../public/locales');

type Tree = { [key: string]: string | Tree };

const readLocale = (lang: string): Tree =>
    JSON.parse(readFileSync(join(LOCALES_DIR, lang, 'translation.json'), 'utf-8')) as Tree;

/** Dotted leaf paths, so a nested rename shows up as the exact key a `t()` call would use. */
const leafKeys = (tree: Tree, prefix = ''): string[] =>
    Object.entries(tree).flatMap(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return typeof value === 'object' && value !== null ? leafKeys(value, path) : [path];
    });

describe('i18n 로케일 정합성', () => {
    const ko = leafKeys(readLocale('ko'));
    const en = leafKeys(readLocale('en'));

    it('ko와 en의 키 집합이 완전히 같다', () => {
        // Reported as sorted lists rather than a count: a failure should name the missing keys, since
        // the fix is to add those exact paths.
        expect(en.filter(key => !ko.includes(key)).sort()).toEqual([]);
        // The direction that actually reaches users as a raw key on screen.
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
