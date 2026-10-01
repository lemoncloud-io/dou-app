import { renderHook } from '@testing-library/react';
import type { IAppBridgeHost } from '@chatic/bridges';

import { useWebMessageRouter } from './useWebMessageRouter';

const mockMediaExport = {
    handleSaveToPhotoLibrary: jest.fn().mockResolvedValue({ type: 'OnSaveToPhotoLibrary', success: true }),
    handleShareFile: jest.fn().mockResolvedValue({ type: 'OnShareFile', success: true }),
};

const mockPhotoLibrary = {
    isAvailable: true,
    handleListPhotoAlbums: jest.fn().mockResolvedValue({ type: 'OnListPhotoAlbums', success: true }),
    handleListPhotos: jest.fn().mockResolvedValue({ type: 'OnListPhotos', success: true }),
    handleReadPhoto: jest.fn().mockResolvedValue({ type: 'OnReadPhoto', success: true }),
    handleManagePhotoSelection: jest.fn().mockResolvedValue({ type: 'OnManagePhotoSelection', success: true }),
};

const PHOTO_LIBRARY_MESSAGES = ['ListPhotoAlbums', 'ListPhotos', 'ReadPhoto', 'ManagePhotoSelection'];

// Every domain hook becomes a stub whose handlers are fresh mocks, so the router can be mounted on
// its own; the real hooks pull in native modules and the service provider. Media export and the
// photo library are pinned so a registered handler can be traced back to them.
jest.mock('./index', () => {
    const stubHandlers = () => new Proxy({}, { get: (_target, name) => (name === 'then' ? undefined : jest.fn()) });
    return new Proxy(
        {},
        {
            get: (_target, name) => {
                if (name === '__esModule') return true;
                if (name === 'useMediaExportHandler') return () => mockMediaExport;
                if (name === 'usePhotoLibraryHandler') return () => mockPhotoLibrary;
                return () => stubHandlers();
            },
        }
    );
});

jest.mock('./useAppStateHandler', () => ({
    useAppStateHandler: () => ({ handleFetchBackgroundStatus: jest.fn(), handleDismissResumeOverlay: jest.fn() }),
}));

const createBridgeMock = (): jest.Mocked<IAppBridgeHost> =>
    ({
        registerHandler: jest.fn(),
        unregisterHandler: jest.fn(),
        pushEvent: jest.fn(),
        handleMessage: jest.fn(),
    }) as any;

describe('useWebMessageRouter', () => {
    const registered = (bridge: jest.Mocked<IAppBridgeHost>) => bridge.registerHandler.mock.calls.map(call => call[0]);

    // The web shows save and share only when the handshake lists both message names, and the
    // handshake is built from the compiled message map rather than from this router. A type in the
    // map with no handler here would be advertised to the web and then answer NOT_FOUND.
    it('registers SaveToPhotoLibrary and ShareFile', () => {
        const bridge = createBridgeMock();

        renderHook(() => useWebMessageRouter({ bridge }));

        expect(registered(bridge)).toEqual(expect.arrayContaining(['SaveToPhotoLibrary', 'ShareFile']));
    });

    it('routes both to the media export handlers', async () => {
        const bridge = createBridgeMock();
        renderHook(() => useWebMessageRouter({ bridge }));
        const handlerFor = (type: string) =>
            bridge.registerHandler.mock.calls.find(call => call[0] === type)?.[1] as any;
        const save = { type: 'SaveToPhotoLibrary', data: { uri: 'file:///a.png' } };
        const share = { type: 'ShareFile', data: { uri: 'file:///a.png', title: 'a.png' } };

        await handlerFor('SaveToPhotoLibrary')(save);
        await handlerFor('ShareFile')(share);

        expect(mockMediaExport.handleSaveToPhotoLibrary).toHaveBeenCalledWith(save);
        expect(mockMediaExport.handleShareFile).toHaveBeenCalledWith(share);
    });

    it('unregisters them when it unmounts', () => {
        const bridge = createBridgeMock();
        const { unmount } = renderHook(() => useWebMessageRouter({ bridge }));

        unmount();

        const removed = bridge.unregisterHandler.mock.calls.map(call => call[0]);
        expect(removed).toEqual(expect.arrayContaining(['SaveToPhotoLibrary', 'ShareFile']));
    });

    describe('photo library', () => {
        afterEach(() => {
            mockPhotoLibrary.isAvailable = true;
        });

        it('registers its four messages where the native module exists', async () => {
            const bridge = createBridgeMock();
            renderHook(() => useWebMessageRouter({ bridge }));
            const handlerFor = (type: string) =>
                bridge.registerHandler.mock.calls.find(call => call[0] === type)?.[1] as any;
            const read = { type: 'ReadPhoto', data: { id: 'p1' } };

            await handlerFor('ReadPhoto')(read);

            expect(registered(bridge)).toEqual(expect.arrayContaining(PHOTO_LIBRARY_MESSAGES));
            expect(mockPhotoLibrary.handleReadPhoto).toHaveBeenCalledWith(read);
        });

        // Unregistered, the bridge answers NOT_FOUND — the web's signal to use its own file input.
        // A registered handler answering an error instead would leave the web asking.
        it('leaves them unregistered where the native module is missing', () => {
            mockPhotoLibrary.isAvailable = false;
            const bridge = createBridgeMock();

            renderHook(() => useWebMessageRouter({ bridge }));

            for (const type of PHOTO_LIBRARY_MESSAGES) expect(registered(bridge)).not.toContain(type);
            expect(registered(bridge)).toEqual(expect.arrayContaining(['SaveToPhotoLibrary', 'ShareFile']));
        });
    });
});
