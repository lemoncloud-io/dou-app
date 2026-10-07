// Each case loads the bridge over its own native module, since what the bridge does depends on which
// methods that module has.
const load = async (module: Record<string, jest.Mock> | undefined) => {
    jest.resetModules();
    jest.doMock('react-native', () => ({ NativeModules: module ? { PhotoLibrary: module } : {} }));
    const { PhotoLibraryBridge } = await import('./PhotoLibraryBridge');
    return PhotoLibraryBridge;
};

const page = { access: 'granted', items: [] };

afterEach(() => jest.dontMock('react-native'));

describe('PhotoLibraryBridge on a module that keeps videos', () => {
    const module = () => ({
        listAlbums: jest.fn().mockResolvedValue({ access: 'granted', albums: [] }),
        listPhotos: jest.fn().mockResolvedValue(page),
        readPhoto: jest.fn(),
        manageSelection: jest.fn(),
        keepLibraryVideo: jest
            .fn()
            .mockResolvedValue({ kind: 'video', uri: 'file:///x', name: 'x.mp4', contentType: 'video/mp4', size: 1 }),
    });

    it('passes the media types to both lists and keeps a video through native', async () => {
        const native = module();
        const bridge = await load(native);

        await bridge.listAlbums({ mediaTypes: ['image', 'video'] });
        await bridge.listPhotos({ limit: 60, mediaTypes: ['image', 'video'] });
        await bridge.keepVideo('v:1');

        expect(bridge.canKeepVideo).toBe(true);
        expect(native.listAlbums).toHaveBeenCalledWith({ mediaTypes: ['image', 'video'] });
        expect(native.listPhotos).toHaveBeenCalledWith({ limit: 60, mediaTypes: ['image', 'video'] });
        expect(native.keepLibraryVideo).toHaveBeenCalledWith('v:1');
    });
});

describe('PhotoLibraryBridge on a module from before videos', () => {
    const module = () => ({
        listAlbums: jest.fn().mockResolvedValue({ access: 'granted', albums: [] }),
        listPhotos: jest.fn().mockResolvedValue(page),
        readPhoto: jest.fn(),
        manageSelection: jest.fn(),
    });

    // Its listAlbums takes no argument, and React Native rejects a call with the wrong count.
    it('calls listAlbums with no argument and drops the media types from a page request', async () => {
        const native = module();
        const bridge = await load(native);

        await bridge.listAlbums({ mediaTypes: ['image', 'video'] });
        await bridge.listPhotos({ limit: 60, after: 'c', mediaTypes: ['image', 'video'] });

        expect(native.listAlbums).toHaveBeenCalledWith();
        expect(native.listPhotos).toHaveBeenCalledWith({ limit: 60, after: 'c' });
    });

    it('cannot keep a video', async () => {
        const bridge = await load(module());

        expect(bridge.canKeepVideo).toBe(false);
        await expect(bridge.keepVideo('v:1')).rejects.toMatchObject({ code: 'INTERNAL' });
    });
});

describe('PhotoLibraryBridge without the native module', () => {
    it('is unavailable and rejects every call with INTERNAL', async () => {
        const bridge = await load(undefined);

        expect(bridge.isAvailable).toBe(false);
        expect(bridge.canKeepVideo).toBe(false);
        await expect(bridge.listAlbums({})).rejects.toMatchObject({ code: 'INTERNAL' });
        await expect(bridge.listPhotos({ limit: 1 })).rejects.toMatchObject({ code: 'INTERNAL' });
    });
});
