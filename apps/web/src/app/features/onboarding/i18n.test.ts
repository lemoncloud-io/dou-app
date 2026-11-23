import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const load = (locale: string): Record<string, unknown> =>
    JSON.parse(readFileSync(join(__dirname, `../../../../public/locales/${locale}/translation.json`), 'utf-8'));

const read = (bundle: Record<string, unknown>, path: string) =>
    path.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);

const LOCALES = ['ko', 'en'];

const KEYS = [
    'next',
    'done',
    'namePlaceholder',
    'nameHint',
    'nameTooLong',
    'photoOptional',
    'imageSizeError',
    'saveError',
    'cloud.title',
    'cloud.subtitle',
    'cloud.nameLabel',
    'place.title',
    'place.subtitle',
    'place.nameLabel',
    'place.photoLabel',
    'profile.title',
    'profile.subtitle',
    'profile.nameLabel',
    'profile.photoLabel',
];

describe('설정 위자드 문구', () => {
    it.each(LOCALES)('%s가 모든 키를 정의한다', locale => {
        const bundle = load(locale);
        expect(KEYS.filter(k => typeof read(bundle, `setupWizard.${k}`) !== 'string')).toEqual([]);
    });

    it.each(LOCALES)('%s가 치환 변수를 유지한다', locale => {
        const bundle = load(locale);
        expect(read(bundle, 'setupWizard.nameHint')).toContain('{{max}}');
        expect(read(bundle, 'setupWizard.nameTooLong')).toContain('{{max}}');
        expect(read(bundle, 'setupWizard.profile.title')).toContain('{{place}}');
    });

    it('클라우드 단계에는 사진 문구가 없다 — 서버에 이미지 필드가 없다', () => {
        for (const locale of LOCALES) {
            expect(read(load(locale), 'setupWizard.cloud.photoLabel')).toBeUndefined();
        }
    });
});
