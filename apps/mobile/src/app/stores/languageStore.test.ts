const mockReadLanguagePreference = jest.fn();
const mockWriteLanguagePreference = jest.fn();
const mockSharedSet = jest.fn().mockResolvedValue(undefined);

jest.mock('./languageStorage', () => ({
    readLanguagePreference: () => mockReadLanguagePreference(),
    writeLanguagePreference: (value: string) => mockWriteLanguagePreference(value),
}));
jest.mock('../bridge', () => ({
    SharedLanguageBridge: { set: (value: string) => mockSharedSet(value) },
}));
jest.mock('../utils/device', () => ({ getAppLanguage: () => 'ja' }));

describe('useLanguageStore', () => {
    beforeEach(() => {
        jest.resetModules();
        mockReadLanguagePreference.mockReset();
        mockWriteLanguagePreference.mockReset();
        mockSharedSet.mockClear();
    });

    /** The store reads storage during module evaluation, so each case needs a fresh import. */
    const load = () => ({
        store: require('./languageStore').useLanguageStore,
        i18n: require('../utils/i18n'),
    });

    it('reads the stored choice synchronously at creation', () => {
        mockReadLanguagePreference.mockReturnValue('en');

        expect(load().store.getState().preference).toBe('en');
    });

    it('copies the stored choice to shared storage once per launch, for the push services', () => {
        mockReadLanguagePreference.mockReturnValue('ko');

        load();

        expect(mockSharedSet).toHaveBeenCalledWith('ko');
        expect(mockWriteLanguagePreference).not.toHaveBeenCalled();
    });

    it('setPreference updates the state, the store and the shared copy', () => {
        mockReadLanguagePreference.mockReturnValue('system');
        const { store } = load();
        mockSharedSet.mockClear();

        store.getState().setPreference('en');

        expect(store.getState().preference).toBe('en');
        expect(mockWriteLanguagePreference).toHaveBeenCalledWith('en');
        expect(mockSharedSet).toHaveBeenCalledWith('en');
    });

    it("makes t() follow a pinned choice, and the device's language on system", () => {
        mockReadLanguagePreference.mockReturnValue('ko');
        const { store, i18n } = load();

        expect(i18n.getEffectiveLanguage()).toBe('ko');

        store.getState().setPreference('system');

        expect(i18n.getEffectiveLanguage()).toBe('ja');
    });
});
