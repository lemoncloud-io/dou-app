import { readThemeMode, writeThemeMode } from './themeStorage';

const mockGetSync = jest.fn();
const mockSetSync = jest.fn();

// Stub the services barrel: importing the real one drags in the whole provider
// (MMKV, SQLite, Firebase, ...) which cannot load under jsdom. The value model
// (themeMode) is NOT mocked — this exercises the parser that ships.
jest.mock('../services', () => ({
    provider: {
        preferenceService: {
            getSync: (key: string) => mockGetSync(key),
            setSync: (key: string, value: unknown) => mockSetSync(key, value),
        },
    },
}));

describe('readThemeMode — 동기 복원', () => {
    beforeEach(() => {
        mockGetSync.mockReset();
        mockSetSync.mockReset();
    });

    it('저장값이 없으면 라이트로 떨어진다', () => {
        mockGetSync.mockReturnValue(null);

        expect(readThemeMode()).toBe('light');
        expect(mockSetSync).not.toHaveBeenCalled();
    });

    it('정규 포맷의 저장값은 그대로 복원하고 되쓰지 않는다', () => {
        mockGetSync.mockReturnValue('dark');

        expect(readThemeMode()).toBe('dark');
        // A plain read must stay a read — no redundant MMKV write on every boot.
        expect(mockSetSync).not.toHaveBeenCalled();
    });

    it('레거시 봉투는 복원한 뒤 평문으로 마이그레이션한다', () => {
        mockGetSync.mockReturnValue('{"state":{"theme":"dark"},"version":0}');

        expect(readThemeMode()).toBe('dark');
        // Without this rewrite, FetchPreference would keep handing envelopes to the web forever.
        expect(mockSetSync).toHaveBeenCalledWith('theme', 'dark');
    });

    it("레거시 봉투의 'system'은 라이트로 정규화하고 되쓴다", () => {
        mockGetSync.mockReturnValue('{"state":{"theme":"system"},"version":0}');

        // 'system' in the legacy format is the old default leaking through, not a choice —
        // honoring it is what painted a dark shell behind a light-themed app.
        expect(readThemeMode()).toBe('light');
        expect(mockSetSync).toHaveBeenCalledWith('theme', 'light');
    });

    it("정규 포맷으로 저장된 'system'은 명시적 선택으로 존중한다", () => {
        mockGetSync.mockReturnValue('system');

        // Only writeThemeMode produces this shape, and it is only reached through bridge
        // validation — so this IS a user choice. Collapsing it here would make the native
        // shell disagree with the web, which honors a stored 'system'.
        expect(readThemeMode()).toBe('system');
        expect(mockSetSync).not.toHaveBeenCalled();
    });

    it('손상된 값은 라이트로 떨어지고 되쓰지 않는다', () => {
        mockGetSync.mockReturnValue('not-a-theme');

        expect(readThemeMode()).toBe('light');
        expect(mockSetSync).not.toHaveBeenCalled();
    });
});

describe('writeThemeMode — 저장', () => {
    it('평문 모드로 theme 키에 저장한다', () => {
        mockSetSync.mockReset();

        writeThemeMode('dark');

        expect(mockSetSync).toHaveBeenCalledWith('theme', 'dark');
    });
});
