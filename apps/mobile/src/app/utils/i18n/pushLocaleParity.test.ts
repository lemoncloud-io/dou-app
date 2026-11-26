import { readFileSync } from 'fs';
import { join } from 'path';

import { en, ko } from './locales';

const MOBILE_ROOT = join(__dirname, '../../../..');

const NATIVE_SETS = {
    android: 'android/app/src/main/assets/locales',
    iosApp: 'ios/assets/locales',
    iosExtension: 'ios/ChaticNotificationServiceExtension',
} as const;

const SHELL_SETS = { ko, en } as const;

const LANGS = ['ko', 'en'] as const;

const pushKeys = (source: Record<string, unknown>): string[] =>
    Object.keys(source)
        .filter(key => key.startsWith('push_'))
        .sort();

const readNative = (dir: string, lang: string): Record<string, unknown> =>
    JSON.parse(readFileSync(join(MOBILE_ROOT, dir, `${lang}.json`), 'utf-8'));

describe('푸시 번역 키 4벌 동기화', () => {
    it.each(LANGS)('%s: 네이티브 3벌이 셸 로케일과 같은 push_ 키를 갖는다', lang => {
        const expected = pushKeys(SHELL_SETS[lang] as unknown as Record<string, unknown>);

        expect(expected.length).toBeGreaterThan(0);

        for (const [name, dir] of Object.entries(NATIVE_SETS)) {
            expect({ [name]: pushKeys(readNative(dir, lang)) }).toEqual({ [name]: expected });
        }
    });

    it.each(LANGS)('%s: push_ 키의 값이 비어 있지 않다', lang => {
        for (const dir of Object.values(NATIVE_SETS)) {
            const source = readNative(dir, lang);
            for (const key of pushKeys(source)) {
                expect(source[key]).toEqual(expect.any(String));
                expect(String(source[key]).trim()).not.toBe('');
            }
        }
    });

    it.each(LANGS)('%s: 클라우드 활성 제목이 이름 자리를 갖는다', lang => {
        for (const dir of Object.values(NATIVE_SETS)) {
            expect(readNative(dir, lang).push_cloud_activate_title).toContain('{0}');
        }
    });

    const PLURAL_BODY_KEYS = [
        'push_chat_images_body',
        'push_chat_videos_body',
        'push_chat_files_body',
        'push_chat_attachments_body',
    ] as const;
    const ARGLESS_BODY_KEYS = [
        'push_chat_image_body',
        'push_chat_video_body',
        'push_chat_file_body',
        'push_chat_fallback_body',
    ] as const;

    const allSets = (lang: (typeof LANGS)[number]): Record<string, Record<string, unknown>> => ({
        shell: SHELL_SETS[lang] as unknown as Record<string, unknown>,
        ...Object.fromEntries(Object.entries(NATIVE_SETS).map(([name, dir]) => [name, readNative(dir, lang)])),
    });

    it.each(LANGS)('%s: plural attachment bodies keep the count placeholder', lang => {
        for (const [name, source] of Object.entries(allSets(lang))) {
            for (const key of PLURAL_BODY_KEYS) {
                expect({ [`${name}.${key}`]: source[key] }).toEqual({
                    [`${name}.${key}`]: expect.stringContaining('{0}'),
                });
            }
        }
    });

    const BODY_KINDS = ['message', 'image', 'images', 'video', 'videos', 'file', 'files', 'attachments'] as const;
    const ROOM_SHAPES = ['thread', 'group', 'group_thread'] as const;
    const shapeKey = (shape: string, kind: string): string => `push_chat_${shape}_${kind}_body`;

    it.each(LANGS)('%s: every room shape has every body kind', lang => {
        const expected = ROOM_SHAPES.flatMap(shape => BODY_KINDS.map(kind => shapeKey(shape, kind)));
        expect(expected).toHaveLength(24);
        for (const [name, source] of Object.entries(allSets(lang))) {
            expect({ [name]: expected.filter(key => !(key in source)) }).toEqual({ [name]: [] });
        }
    });

    it.each(LANGS)('%s: a room shape key wraps the plain key copy', lang => {
        for (const [name, source] of Object.entries(allSets(lang))) {
            for (const shape of ROOM_SHAPES) {
                const grouped = shape.startsWith('group');
                for (const kind of BODY_KINDS) {
                    const plain = String(source[`push_chat_${kind}_body`]);
                    const wrapped = grouped ? plain.replace('{0}', '{1}') : plain;
                    const key = shapeKey(shape, kind);
                    expect({ [`${name}.${key}`]: source[key] }).toEqual({
                        [`${name}.${key}`]: expect.stringContaining(wrapped),
                    });
                    if (grouped) {
                        expect({ [`${name}.${key}`]: String(source[key]).indexOf('{0}') }).not.toEqual({
                            [`${name}.${key}`]: -1,
                        });
                    }
                }
            }
        }
    });

    it.each(LANGS)('%s: singular attachment bodies and the fallback carry no placeholder', lang => {
        for (const [name, source] of Object.entries(allSets(lang))) {
            for (const key of ARGLESS_BODY_KEYS) {
                expect({ [`${name}.${key}`]: source[key] }).toEqual({ [`${name}.${key}`]: expect.any(String) });
                expect({ [`${name}.${key}`]: String(source[key]).includes('{') }).toEqual({
                    [`${name}.${key}`]: false,
                });
            }
        }
    });
});
