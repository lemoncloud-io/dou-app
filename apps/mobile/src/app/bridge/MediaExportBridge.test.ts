// Loads the bridge over a given native module, the way JS runs over whichever native build is installed.
const loadBridge = async (mediaExport: Record<string, unknown> | undefined) => {
    jest.resetModules();
    jest.doMock('react-native', () => ({ NativeModules: mediaExport ? { MediaExport: mediaExport } : {} }));
    const { MediaExportBridge } = await import('./MediaExportBridge');
    return MediaExportBridge;
};

describe('MediaExportBridge', () => {
    afterEach(() => {
        jest.dontMock('react-native');
    });

    it('can open and save where the native module has both methods, and passes the arguments through', async () => {
        const openFile = jest.fn().mockResolvedValue({});
        const saveFile = jest.fn().mockResolvedValue({ saved: true, location: 'Download/DoU/a.pdf' });
        const bridge = await loadBridge({ saveToPhotoLibrary: jest.fn(), shareFile: jest.fn(), openFile, saveFile });

        expect(bridge.canOpenFile).toBe(true);
        expect(bridge.canSaveFile).toBe(true);
        await bridge.openFile('file:///d/a.pdf');
        await expect(bridge.saveFile('file:///d/a.pdf', 'a.pdf')).resolves.toEqual({
            saved: true,
            location: 'Download/DoU/a.pdf',
        });
        expect(openFile).toHaveBeenCalledWith('file:///d/a.pdf');
        expect(saveFile).toHaveBeenCalledWith('file:///d/a.pdf', 'a.pdf');
    });

    // A native module built before OpenFile and SaveFile still saves and shares.
    it('cannot open or save on a native module that predates them, and rejects with INTERNAL', async () => {
        const shareFile = jest.fn().mockResolvedValue({ completed: null });
        const bridge = await loadBridge({ saveToPhotoLibrary: jest.fn(), shareFile });

        expect(bridge.canOpenFile).toBe(false);
        expect(bridge.canSaveFile).toBe(false);
        await expect(bridge.openFile('file:///d/a.pdf')).rejects.toMatchObject({ code: 'INTERNAL' });
        await expect(bridge.saveFile('file:///d/a.pdf', 'a.pdf')).rejects.toMatchObject({ code: 'INTERNAL' });
        await bridge.shareFile('file:///d/a.png');
        expect(shareFile).toHaveBeenCalledWith('file:///d/a.png', null);
    });

    it('tells each method apart', async () => {
        const bridge = await loadBridge({ openFile: jest.fn() });

        expect(bridge.canOpenFile).toBe(true);
        expect(bridge.canSaveFile).toBe(false);
    });

    it('can do neither without the native module', async () => {
        const bridge = await loadBridge(undefined);

        expect(bridge.canOpenFile).toBe(false);
        expect(bridge.canSaveFile).toBe(false);
        await expect(bridge.saveToPhotoLibrary('file:///d/a.png')).rejects.toMatchObject({ code: 'INTERNAL' });
    });
});
