import { resolveAppLanguage } from './appLanguage';

describe('resolveAppLanguage', () => {
    it('takes the language subtag from a BCP-47 locale', () => {
        expect(resolveAppLanguage('ko-KR')).toBe('ko');
        expect(resolveAppLanguage('en-US')).toBe('en');
        expect(resolveAppLanguage('ja-JP')).toBe('ja');
    });

    it('keeps mobile parity: the bare subtag, never a PageLanguage rename', () => {
        // apps/mobile injects `languageCode`, so 'ja'/'zh' stay as-is even though PageLanguage
        // spells them 'jp'/'cn'. Renaming here would make the two clients disagree.
        // Source of truth: apps/mobile/src/app/utils/device.ts:39 (`getAppLanguage`). This test
        // cannot see that file, so it keeps passing if mobile starts mapping into PageLanguage —
        // check there first if the two clients ever disagree on a language.
        expect(resolveAppLanguage('ja-JP')).toBe('ja');
        expect(resolveAppLanguage('zh-CN')).toBe('zh');
    });

    it('accepts an underscore-separated locale and normalises case', () => {
        expect(resolveAppLanguage('ko_KR')).toBe('ko');
        expect(resolveAppLanguage('KO-kr')).toBe('ko');
        expect(resolveAppLanguage('ko')).toBe('ko');
    });

    it('falls back to en for the values that actually occur', () => {
        // `app.getLocale()` returns '' before the app is ready; the env override may be unset.
        expect(resolveAppLanguage('')).toBe('en');
        expect(resolveAppLanguage(undefined)).toBe('en');
        expect(resolveAppLanguage('   ')).toBe('en');
    });

    it('rejects junk rather than injecting it', () => {
        expect(resolveAppLanguage('-KR')).toBe('en');
        expect(resolveAppLanguage('123')).toBe('en');
        expect(resolveAppLanguage('korean')).toBe('en');
    });
});
