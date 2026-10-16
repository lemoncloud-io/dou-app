import { en } from './en';
import { initialLanguage, saveLanguage, translator } from './index';
import { ko } from './ko';

describe('the language packs', () => {
    it('carry the same keys, none of them empty', () => {
        expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
        expect(Object.values(ko).every(Boolean)).toBe(true);
    });

    it('fill a slot with its value, and leave one with no value as written', () => {
        expect(translator('en')('toast.unsupported', { type: 'ListPhotos' })).toBe(
            'Not supported in the virtual shell: ListPhotos'
        );
        expect(translator('ko')('toast.unsupported')).toContain('{type}');
    });
});

describe('initialLanguage', () => {
    const storage = (value: string | null) => ({ getItem: () => value });

    it('takes the language picked last time', () => {
        expect(initialLanguage(storage('en'), 'ko-KR', '')).toBe('en');
    });

    it('takes the language a link carries over from the other environment first', () => {
        expect(initialLanguage(storage('en'), 'en-US', '?lang=ko')).toBe('ko');
        expect(initialLanguage(storage('en'), 'en-US', '?lang=fr')).toBe('en');
    });

    it('otherwise follows the browser: Korean for a Korean one, English for the rest', () => {
        expect(initialLanguage(storage(null), 'ko-KR', '')).toBe('ko');
        expect(initialLanguage(storage('fr'), 'ja-JP', '')).toBe('en');
    });

    it('survives a storage that refuses to be read or written', () => {
        const refusing = {
            getItem: () => {
                throw new Error('blocked');
            },
            setItem: () => {
                throw new Error('blocked');
            },
        };

        expect(initialLanguage(refusing, 'ko', '')).toBe('ko');
        expect(() => saveLanguage('en', refusing)).not.toThrow();
    });
});
