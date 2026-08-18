import { DEFAULT_THEME_MODE, isThemeMode, parseThemeMode } from './themeMode';

describe('parseThemeMode — 저장 포맷 흡수', () => {
    it('평문 모드를 그대로 반환한다', () => {
        expect(parseThemeMode('light')).toBe('light');
        expect(parseThemeMode('dark')).toBe('dark');
        expect(parseThemeMode('system')).toBe('system');
    });

    it('레거시 zustand-persist 봉투 문자열에서 mode를 꺼낸다', () => {
        expect(parseThemeMode('{"state":{"theme":"dark"},"version":0}')).toBe('dark');
    });

    it('이미 파싱된 봉투 객체에서도 mode를 꺼낸다', () => {
        expect(parseThemeMode({ state: { theme: 'light' } })).toBe('light');
    });

    it('인식할 수 없는 값은 null을 반환한다', () => {
        expect(parseThemeMode(null)).toBeNull();
        expect(parseThemeMode(undefined)).toBeNull();
        expect(parseThemeMode('')).toBeNull();
        expect(parseThemeMode('purple')).toBeNull();
        expect(parseThemeMode(42)).toBeNull();
        expect(parseThemeMode('{"state":{"theme":"purple"}}')).toBeNull();
        expect(parseThemeMode({ state: {} })).toBeNull();
        expect(parseThemeMode({ state: { theme: ['dark'] } })).toBeNull();
    });

    it('스크립트 이스케이프 탈출을 노린 값을 거부한다', () => {
        // The parsed value is interpolated into an injected WebView script, so the whitelist is
        // the boundary that keeps a stored string from becoming code.
        expect(parseThemeMode("light'; window.__pwned=1; //")).toBeNull();
        expect(parseThemeMode('{"state":{"theme":"light\'; window.__pwned=1; //"}}')).toBeNull();
        expect(parseThemeMode('light\\')).toBeNull();
        expect(parseThemeMode('light\n')).toBeNull();
        expect(parseThemeMode('</script>')).toBeNull();
    });

    it('반환값은 항상 세 리터럴 중 하나이거나 null이다', () => {
        for (const raw of ['light', 'dark', 'system', 'purple', '{"state":{"theme":"dark"}}', 42, null]) {
            const parsed = parseThemeMode(raw);
            expect(parsed === null || isThemeMode(parsed)).toBe(true);
        }
    });
});

describe('DEFAULT_THEME_MODE', () => {
    it("OS 스킴이 아니라 'light'다", () => {
        expect(DEFAULT_THEME_MODE).toBe('light');
    });
});
