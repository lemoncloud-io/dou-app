import { resolveAppLanguage } from './appLanguage';

describe('resolveAppLanguage', () => {
    it('takes the language subtag from a BCP-47 locale', () => {
        expect(resolveAppLanguage('ko-KR')).toBe('ko');
        expect(resolveAppLanguage('en-US')).toBe('en');
        expect(resolveAppLanguage('ja-JP')).toBe('ja');
    });

    it('keeps mobile parity: the bare subtag, never a PageLanguage rename', () => {
        expect(resolveAppLanguage('ja-JP')).toBe('ja');
        expect(resolveAppLanguage('zh-CN')).toBe('zh');
    });

    it('accepts an underscore-separated locale and normalises case', () => {
        expect(resolveAppLanguage('ko_KR')).toBe('ko');
        expect(resolveAppLanguage('KO-kr')).toBe('ko');
        expect(resolveAppLanguage('ko')).toBe('ko');
    });

    it('falls back to en for the values that actually occur', () => {
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
