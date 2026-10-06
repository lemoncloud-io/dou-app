import { renderHook } from '@testing-library/react';
import type { IAppBridgeHost } from '@chatic/bridges';

import { useWebMessageRouter } from './useWebMessageRouter';

const mockMediaExport = {
    canOpenFile: true,
    canSaveFile: true,
    handleSaveToPhotoLibrary: jest.fn().mockResolvedValue({ type: 'OnSaveToPhotoLibrary', success: true }),
    handleShareFile: jest.fn().mockResolvedValue({ type: 'OnShareFile', success: true }),
    handleOpenFile: jest.fn().mockResolvedValue({ type: 'OnOpenFile', success: true }),
    handleSaveFile: jest.fn().mockResolvedValue({ type: 'OnSaveFile', success: true }),
};

const mockAttachmentPicker = {
    isAvailable: true,
    handlePickAttachments: jest.fn().mockResolvedValue({ type: 'OnPickAttachments', success: true }),
    handlePrepareVideo: jest.fn().mockResolvedValue({ type: 'OnPrepareVideo', success: true }),
    handleReadAttachment: jest.fn().mockResolvedValue({ type: 'OnReadAttachment', success: true }),
    canReadVideoFrame: true,
    handleReadVideoFrame: jest.fn().mockResolvedValue({ type: 'OnReadVideoFrame', success: true }),
};

const ATTACHMENT_PICKER_MESSAGES = ['PickAttachments', 'PrepareVideo', 'ReadAttachment'];

const mockPhotoLibrary = {
    isAvailable: true,
    handleListPhotoAlbums: jest.fn().mockResolvedValue({ type: 'OnListPhotoAlbums', success: true }),
    handleListPhotos: jest.fn().mockResolvedValue({ type: 'OnListPhotos', success: true }),
    handleReadPhoto: jest.fn().mockResolvedValue({ type: 'OnReadPhoto', success: true }),
    handleManagePhotoSelection: jest.fn().mockResolvedValue({ type: 'OnManagePhotoSelection', success: true }),
    canKeepVideo: true,
    handleKeepLibraryVideo: jest.fn().mockResolvedValue({ type: 'OnKeepLibraryVideo', success: true }),
};

const PHOTO_LIBRARY_MESSAGES = ['ListPhotoAlbums', 'ListPhotos', 'ReadPhoto', 'ManagePhotoSelection'];

// Every domain hook becomes a stub whose handlers are fresh mocks, so the router can be mounted on
// its own; the real hooks pull in native modules and the service provider. Media export, the
// attachment picker and the photo library are pinned so a registered handler can be traced back to them.
jest.mock('./index', () => {
    const stubHandlers = () => new Proxy({}, { get: (_target, name) => (name === 'then' ? undefined : jest.fn()) });
    return new Proxy(
        {},
        {
            get: (_target, name) => {
                if (name === '__esModule') return true;
                if (name === 'useMediaExportHandler') return () => mockMediaExport;
                if (name === 'usePhotoLibraryHandler') return () => mockPhotoLibrary;
                if (name === 'useAttachmentPickerHandler') return () => mockAttachmentPicker;
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
    describe('methods newer than their module', () => {
        afterEach(() => {
            mockPhotoLibrary.isAvailable = true;
            mockPhotoLibrary.canKeepVideo = true;
            mockAttachmentPicker.isAvailable = true;
            mockAttachmentPicker.canReadVideoFrame = true;
        });
        const handlerFor = (bridge: jest.Mocked<IAppBridgeHost>, type: string) =>
            bridge.registerHandler.mock.calls.find(call => call[0] === type)?.[1] as any;

        it('registers KeepLibraryVideo and ReadVideoFrame where native has the methods, and routes them', async () => {
            const bridge = createBridgeMock();
            renderHook(() => useWebMessageRouter({ bridge }));
            const keep = { type: 'KeepLibraryVideo', data: { id: 'v:1' } };
            const frame = { type: 'ReadVideoFrame', data: { url: 'https://s3/v', atMs: 500, maxEdge: 400 } };

            await handlerFor(bridge, 'KeepLibraryVideo')(keep);
            await handlerFor(bridge, 'ReadVideoFrame')(frame);

            expect(mockPhotoLibrary.handleKeepLibraryVideo).toHaveBeenCalledWith(keep);
            expect(mockAttachmentPicker.handleReadVideoFrame).toHaveBeenCalledWith(frame);
        });

        // The module is there, the method is not: the web must get NOT_FOUND for that one message
        // while the rest of the module keeps working.
        it('leaves each unregistered where its module lacks the method', () => {
            mockPhotoLibrary.canKeepVideo = false;
            mockAttachmentPicker.canReadVideoFrame = false;
            const bridge = createBridgeMock();

            renderHook(() => useWebMessageRouter({ bridge }));

            expect(registered(bridge)).not.toContain('KeepLibraryVideo');
            expect(registered(bridge)).not.toContain('ReadVideoFrame');
            expect(registered(bridge)).toEqual(
                expect.arrayContaining([...PHOTO_LIBRARY_MESSAGES, ...ATTACHMENT_PICKER_MESSAGES])
            );
        });

        it('leaves them unregistered where the module itself is missing', () => {
            mockPhotoLibrary.isAvailable = false;
            mockAttachmentPicker.isAvailable = false;
            const bridge = createBridgeMock();

            renderHook(() => useWebMessageRouter({ bridge }));

            expect(registered(bridge)).not.toContain('KeepLibraryVideo');
            expect(registered(bridge)).not.toContain('ReadVideoFrame');
        });

        it('hands ListPhotoAlbums its message, so the media types reach the handler', async () => {
            const bridge = createBridgeMock();
            renderHook(() => useWebMessageRouter({ bridge }));
            const albums = { type: 'ListPhotoAlbums', data: { mediaTypes: ['image', 'video'] } };

            await handlerFor(bridge, 'ListPhotoAlbums')(albums);

            expect(mockPhotoLibrary.handleListPhotoAlbums).toHaveBeenCalledWith(albums);
        });
    });

    describe('attachment picker', () => {
        afterEach(() => {
            mockAttachmentPicker.isAvailable = true;
        });

        it('registers PickAttachments, PrepareVideo and ReadAttachment where the native module exists', async () => {
            const bridge = createBridgeMock();
            renderHook(() => useWebMessageRouter({ bridge }));
            const handlerFor = (type: string) =>
                bridge.registerHandler.mock.calls.find(call => call[0] === type)?.[1] as any;
            const pick = { type: 'PickAttachments', data: { source: 'media', selectionLimit: 10 } };
            const prepare = { type: 'PrepareVideo', data: { uri: 'file:///attach-pick/a/IMG_0001.MOV' } };

            await handlerFor('PickAttachments')(pick);
            await handlerFor('PrepareVideo')(prepare);
            const read = { type: 'ReadAttachment', data: { uri: 'file:///attach-pick/b/photo.jpg' } };
            await handlerFor('ReadAttachment')(read);

            expect(registered(bridge)).toEqual(expect.arrayContaining(ATTACHMENT_PICKER_MESSAGES));
            expect(mockAttachmentPicker.handlePickAttachments).toHaveBeenCalledWith(pick);
            expect(mockAttachmentPicker.handlePrepareVideo).toHaveBeenCalledWith(prepare);
            expect(mockAttachmentPicker.handleReadAttachment).toHaveBeenCalledWith(read);
        });

        // Unregistered, the bridge answers NOT_FOUND — the web's signal to open its own file input.
        it('leaves them unregistered where the native module is missing', () => {
            mockAttachmentPicker.isAvailable = false;
            const bridge = createBridgeMock();

            renderHook(() => useWebMessageRouter({ bridge }));

            for (const type of ATTACHMENT_PICKER_MESSAGES) expect(registered(bridge)).not.toContain(type);
            expect(registered(bridge)).toEqual(expect.arrayContaining(['SaveToPhotoLibrary', 'ShareFile']));
        });
    });

    describe('open and save a file', () => {
        afterEach(() => {
            mockMediaExport.canOpenFile = true;
            mockMediaExport.canSaveFile = true;
        });

        it('registers OpenFile and SaveFile where the native module has both methods', async () => {
            const bridge = createBridgeMock();
            renderHook(() => useWebMessageRouter({ bridge }));
            const handlerFor = (type: string) =>
                bridge.registerHandler.mock.calls.find(call => call[0] === type)?.[1] as any;
            const open = { type: 'OpenFile', data: { uri: 'file:///a.pdf' } };
            const save = { type: 'SaveFile', data: { uri: 'file:///a.pdf', name: 'a.pdf' } };

            await handlerFor('OpenFile')(open);
            await handlerFor('SaveFile')(save);

            expect(mockMediaExport.handleOpenFile).toHaveBeenCalledWith(open);
            expect(mockMediaExport.handleSaveFile).toHaveBeenCalledWith(save);
        });

        // A native MediaExport built before these two still answers save and share, so only the two
        // newer messages go unregistered — and each on its own method's presence.
        it.each([
            ['openFile', 'canOpenFile', 'OpenFile', 'SaveFile'],
            ['saveFile', 'canSaveFile', 'SaveFile', 'OpenFile'],
        ] as const)('leaves %s unregistered where the native method is missing', (_m, flag, missing, present) => {
            mockMediaExport[flag] = false;
            const bridge = createBridgeMock();

            renderHook(() => useWebMessageRouter({ bridge }));

            expect(registered(bridge)).not.toContain(missing);
            expect(registered(bridge)).toEqual(expect.arrayContaining([present, 'SaveToPhotoLibrary', 'ShareFile']));
        });
    });
});
