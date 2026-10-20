import { readFileSync } from 'fs';
import { join } from 'path';

// Not the utils/i18n entry point: that one pulls ../device -> react-native-device-info, which
// jest cannot transform, so importing it here kills this suite at load.
import { en, ko } from '../../utils/i18n/locales';

/**
 * The same push translation key has to exist in FOUR independent locale sets, each read by a
 * different consumer: the RN shell (`utils/i18n/locales`), the Android FCM service, the iOS app,
 * and the iOS Notification Service Extension. A key missing from one set breaks only that path —
 * an iOS background banner renders the literal key while every other surface looks fine — so a
 * hand-sync miss is invisible without this check (ADR-0098).
 *
 * Only flat `push_*` keys are compared. Nested `notification.*` keys predate the naming rule and
 * are consumed unevenly across the sets.
 */
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

        // The shell set is the baseline, so an empty one would make every comparison vacuously pass.
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

    // The activation title takes the cloud name as a positional arg. Without it the send layer's
    // fallback title is the literal type string ("cloud"), so a template that dropped {0} would
    // ship a banner naming no cloud at all.
    it.each(LANGS)('%s: 클라우드 활성 제목이 이름 자리를 갖는다', lang => {
        for (const dir of Object.values(NATIVE_SETS)) {
            expect(readNative(dir, lang).push_cloud_activate_title).toContain('{0}');
        }
    });

    // Attachment bodies split one/many into separate keys because the native templates only do
    // positional substitution. A plural template that lost {0} would say "Sent photos" with no
    // count; a singular one — or the fallback, which is shown exactly when substitution failed —
    // that gained a placeholder would trip the leftover-placeholder guard on every push.
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

    // The server picks the room shape through the body key too: `push_chat_<shape>_<kind>_body`, one per
    // shape and body kind. A shape missing a kind shows its key name on the banner the first time
    // that combination is sent.
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

    // A shape key is the plain key's copy with a marker in front, so the attachment wording now lives
    // in four places. Containing the plain copy is what keeps an edit to one from leaving the other
    // three behind. A group shape puts the sender at {0}, so the plain copy's own args move up one.
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
