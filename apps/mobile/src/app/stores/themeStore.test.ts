const mockReadThemeMode = jest.fn();
const mockWriteThemeMode = jest.fn();

jest.mock('./themeStorage', () => ({
    readThemeMode: () => mockReadThemeMode(),
    writeThemeMode: (mode: string) => mockWriteThemeMode(mode),
}));

describe('useThemeStore — 동기 초기화와 저장', () => {
    beforeEach(() => {
        jest.resetModules();
        mockReadThemeMode.mockReset();
        mockWriteThemeMode.mockReset();
    });

    /** The store reads storage during module evaluation, so each case needs a fresh import. */
    const loadStore = () => require('./themeStore').useThemeStore;

    it('스토어 생성 시점에 저장값을 동기로 읽는다', () => {
        mockReadThemeMode.mockReturnValue('dark');

        const store = loadStore();

        // Synchronous — no act(), no flush, no await. This is what keeps the first
        // frame from painting against a placeholder value.
        expect(store.getState().theme).toBe('dark');
        expect(mockReadThemeMode).toHaveBeenCalledTimes(1);
    });

    it('저장값이 없으면 라이트로 시작한다', () => {
        mockReadThemeMode.mockReturnValue('light');

        expect(loadStore().getState().theme).toBe('light');
    });

    it('초기화만으로는 저장하지 않는다', () => {
        mockReadThemeMode.mockReturnValue('dark');

        loadStore();

        // Guards against setTheme being wired into the initializer, which would rewrite MMKV
        // on every boot. Format migration is readThemeMode's job, not the store's.
        expect(mockWriteThemeMode).not.toHaveBeenCalled();
    });

    it('setTheme이 상태와 저장소를 함께 갱신한다', () => {
        mockReadThemeMode.mockReturnValue('light');
        const store = loadStore();

        store.getState().setTheme('dark');

        expect(store.getState().theme).toBe('dark');
        expect(mockWriteThemeMode).toHaveBeenCalledWith('dark');
    });
});
