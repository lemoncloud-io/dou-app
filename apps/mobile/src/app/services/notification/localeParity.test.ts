import { readFileSync } from 'fs';
import { join } from 'path';

import { en, ko } from '@chatic/i18n-mobile';

/**
 * The same push translation key has to exist in FOUR independent locale sets, each read by a
 * different consumer: the RN shell (`@chatic/i18n-mobile`), the Android FCM service, the iOS app,
 * and the iOS Notification Service Extension. A key missing from one set breaks only that path —
 * an iOS background banner renders the literal key while every other surface looks fine — so a
 * hand-sync miss is invisible without this check (ADR-0075).
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
});
