import { readLanguagePreference, writeLanguagePreference } from './languageStorage';

const mockGetSync = jest.fn();
const mockSetSync = jest.fn();
const mockConfigBag = jest.fn((): Record<string, string> => ({}));

// Stub the services barrel for the same reason themeStorage.test does: the real provider pulls in
// MMKV, SQLite and Firebase. The value model (languagePreference) is not mocked.
jest.mock('../services', () => ({
    provider: {
        preferenceService: {
            getSync: (key: string) => mockGetSync(key),
            setSync: (key: string, value: unknown) => mockSetSync(key, value),
        },
        configKvService: { getAll: () => mockConfigBag() },
    },
}));

describe('readLanguagePreference', () => {
    beforeEach(() => {
        mockGetSync.mockReset();
        mockSetSync.mockReset();
        mockConfigBag.mockReset().mockReturnValue({});
    });

    it('starts on system when nothing is stored, without writing', () => {
        mockGetSync.mockReturnValue(null);

        expect(readLanguagePreference()).toBe('system');
        expect(mockSetSync).not.toHaveBeenCalled();
    });

    it('restores a stored choice as is, and leaves it alone', () => {
        mockGetSync.mockReturnValue('en');

        expect(readLanguagePreference()).toBe('en');
        expect(mockSetSync).not.toHaveBeenCalled();
    });

    // The old zustand-persist envelope held the device language from first launch, or the language in
    // effect an older web mirrored into it — a guess and a pick in the same value, so neither is read
    // as a choice.
    it('discards the legacy envelope instead of reading its language as a pin', () => {
        mockGetSync.mockReturnValue('{"state":{"language":"ko"},"version":0}');

        expect(readLanguagePreference()).toBe('system');
        expect(mockSetSync).toHaveBeenCalledWith('language', 'system');
    });

    it('discards an unknown value the same way', () => {
        mockGetSync.mockReturnValue('ja');

        expect(readLanguagePreference()).toBe('system');
        expect(mockSetSync).toHaveBeenCalledWith('language', 'system');
    });
});

describe("readLanguagePreference — the web's config value", () => {
    beforeEach(() => {
        mockGetSync.mockReset();
        mockSetSync.mockReset();
        mockConfigBag.mockReset();
    });

    // The web ships before the app: a choice made while an older shell was installed lands in that
    // shell's zustand envelope (discarded) and in the config bag. The bag has to win after the update.
    it('takes the choice from the config bag over a legacy envelope, and stores it plainly', () => {
        mockConfigBag.mockReturnValue({ 'ui.language': '"en"' });
        mockGetSync.mockReturnValue('{"state":{"language":"en"},"version":0}');

        expect(readLanguagePreference()).toBe('en');
        expect(mockSetSync).toHaveBeenCalledWith('language', 'en');
    });

    it('wins over a stored choice that disagrees — the bag is what the web resolves from', () => {
        mockConfigBag.mockReturnValue({ 'ui.language': '"system"' });
        mockGetSync.mockReturnValue('ko');

        expect(readLanguagePreference()).toBe('system');
        expect(mockSetSync).toHaveBeenCalledWith('language', 'system');
    });

    it('does not rewrite when the two already agree', () => {
        mockConfigBag.mockReturnValue({ 'ui.language': '"ko"' });
        mockGetSync.mockReturnValue('ko');

        expect(readLanguagePreference()).toBe('ko');
        expect(mockSetSync).not.toHaveBeenCalled();
    });

    it('ignores an unreadable bag value and falls back to the stored choice', () => {
        mockConfigBag.mockReturnValue({ 'ui.language': 'not json' });
        mockGetSync.mockReturnValue('en');

        expect(readLanguagePreference()).toBe('en');
    });
});

describe('writeLanguagePreference', () => {
    it('stores the plain choice under the language key', () => {
        writeLanguagePreference('ko');

        expect(mockSetSync).toHaveBeenCalledWith('language', 'ko');
    });
});
