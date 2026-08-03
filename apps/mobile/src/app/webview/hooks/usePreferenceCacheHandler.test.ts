import { renderHook } from '@testing-library/react';

import { usePreferenceCacheHandler } from './usePreferenceCacheHandler';

const setTheme = jest.fn();
const setLanguage = jest.fn();
const preferenceService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
};
const logService = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };

// Only the stores are mocked. `parseThemeMode` is imported from stores/themeMode, which is
// provider-free, so the value validation below runs against the parser that actually ships.
jest.mock('../../stores', () => ({
    useThemeStore: { getState: () => ({ setTheme }) },
    useLanguageStore: { getState: () => ({ setLanguage }) },
}));

jest.mock('../../hooks', () => ({
    useServices: () => ({ preferenceService, logService }),
}));

const save = (key: string, value: unknown) =>
    renderHook(() => usePreferenceCacheHandler()).result.current.handleSavePreference({
        type: 'SavePreference',
        data: { key, value },
    } as any);

describe('handleSavePreference — bridge write allowlist', () => {
    beforeEach(() => jest.clearAllMocks());

    it("'debugSettings' 브릿지 쓰기를 거부한다 (앱 origin 하이재킹 차단)", async () => {
        const res = await save('debugSettings', { state: { webviewBaseUrlOverride: 'https://evil.example/' } });

        expect(preferenceService.set).not.toHaveBeenCalled();
        expect(res).toEqual({
            type: 'OnSavePreference',
            success: false,
            error: { code: 'PREF_KEY_NOT_WRITABLE', message: expect.stringContaining('debugSettings') },
        });
        expect(logService.warn).toHaveBeenCalled();
    });

    it('화이트리스트 밖의 임의 키도 거부한다', async () => {
        const res = await save('__proto__', 'x');

        expect(preferenceService.set).not.toHaveBeenCalled();
        expect(res.success).toBe(false);
        expect((res as any).error.code).toBe('PREF_KEY_NOT_WRITABLE');
    });

    it("web-facing 'blurLastMessage'는 정상 persist된다", async () => {
        const res = await save('blurLastMessage', true);

        expect(preferenceService.set).toHaveBeenCalledWith('blurLastMessage', true);
        expect(res).toEqual({
            type: 'OnSavePreference',
            success: true,
            data: { key: 'blurLastMessage', success: true },
        });
    });

    it("'isFirstRun'는 정상 persist된다", async () => {
        const res = await save('isFirstRun', 'true');

        expect(preferenceService.set).toHaveBeenCalledWith('isFirstRun', 'true');
        expect(res.success).toBe(true);
    });

    it("'theme'는 themeStore로 라우팅되고 preferenceService.set을 타지 않는다 (회귀 없음)", async () => {
        const res = await save('theme', 'dark');

        expect(setTheme).toHaveBeenCalledWith('dark');
        expect(preferenceService.set).not.toHaveBeenCalled();
        expect(res.success).toBe(true);
    });

    it("'theme'에 인식할 수 없는 값이 오면 거부하고 스토어를 건드리지 않는다", async () => {
        const res = await save('theme', 'purple');

        // Persisting a bogus value would degrade the status bar to light on every
        // boot, with nothing in the app able to explain why.
        expect(setTheme).not.toHaveBeenCalled();
        expect(res.success).toBe(false);
        expect((res as any).error.code).toBe('PREF_INVALID_VALUE');
        expect(logService.warn).toHaveBeenCalled();
    });

    it("'theme'에 스크립트 탈출을 노린 값이 오면 거부한다", async () => {
        // The stored theme is interpolated into an injected WebView script, so this bridge is
        // the boundary that keeps page-controlled text out of it.
        const res = await save('theme', "light'; window.__pwned=1; //");

        expect(setTheme).not.toHaveBeenCalled();
        expect(res.success).toBe(false);
        expect((res as any).error.code).toBe('PREF_INVALID_VALUE');
    });

    it("'theme'에 레거시 봉투가 와도 정규화해 받아들인다", async () => {
        const res = await save('theme', '{"state":{"theme":"dark"},"version":0}');

        expect(setTheme).toHaveBeenCalledWith('dark');
        expect(res.success).toBe(true);
    });

    it("'language'는 languageStore로 라우팅된다 (회귀 없음)", async () => {
        const res = await save('language', 'ko');

        expect(setLanguage).toHaveBeenCalledWith('ko');
        expect(preferenceService.set).not.toHaveBeenCalled();
        expect(res.success).toBe(true);
    });
});
