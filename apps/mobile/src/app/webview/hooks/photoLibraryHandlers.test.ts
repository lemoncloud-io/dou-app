import type { OnListPhotoAlbumsPayload, OnListPhotosPayload, OnReadPhotoPayload } from '@chatic/app-messages';
import type { IPhotoLibraryBridge } from '../../bridge';
import type { ILogService } from '../../services';

import { createPhotoLibraryHandlers } from './photoLibraryHandlers';

// The real bridge barrel loads every native module wrapper; the handlers receive the photo library
// by injection and need nothing else from it at runtime.
jest.mock('../../bridge', () => ({}));

const createLoggerMock = (): jest.Mocked<ILogService> =>
    ({ subscribe: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) as any;

const albums: OnListPhotoAlbumsPayload = {
    access: 'granted',
    albums: [{ id: 'all', title: 'Recents', count: 2, coverBase64: 'Y292ZXI=' }],
};
const page: OnListPhotosPayload = {
    access: 'limited',
    items: [{ id: 'p1', thumbBase64: 'dGh1bWI=', width: 4032, height: 3024, mimeType: 'image/heic' }],
    next: '1:p1',
};
const photo: OnReadPhotoPayload = { base64: 'Ynl0ZXM=', mimeType: 'image/jpeg', fileName: 'IMG_0001.jpg' };

const createLibraryMock = (): jest.Mocked<IPhotoLibraryBridge> => ({
    isAvailable: true,
    listAlbums: jest.fn().mockResolvedValue(albums),
    listPhotos: jest.fn().mockResolvedValue(page),
    readPhoto: jest.fn().mockResolvedValue(photo),
    manageSelection: jest.fn().mockResolvedValue('granted'),
});

const message = <T>(type: string, data: T) => ({ type, data }) as any;

const rejection = (code: string | undefined, text = 'boom') => Object.assign(new Error(text), code ? { code } : {});

describe('createPhotoLibraryHandlers', () => {
    let library: jest.Mocked<IPhotoLibraryBridge>;
    let logger: jest.Mocked<ILogService>;

    beforeEach(() => {
        library = createLibraryMock();
        logger = createLoggerMock();
    });

    const handlers = () => createPhotoLibraryHandlers(library, logger);

    describe('ListPhotoAlbums', () => {
        it('answers with the albums and access the library returned', async () => {
            const reply = await handlers().handleListPhotoAlbums();

            expect(reply).toEqual({ type: 'OnListPhotoAlbums', success: true, data: albums });
        });

        it('reports a native failure as an error envelope and logs its code', async () => {
            library.listAlbums.mockRejectedValueOnce(rejection('INTERNAL', 'fetch failed'));

            const reply = await handlers().handleListPhotoAlbums();

            expect(reply).toEqual({
                type: 'OnListPhotoAlbums',
                success: false,
                error: { code: 'INTERNAL', message: 'fetch failed' },
            });
            expect(logger.warn).toHaveBeenCalledWith('DEVICE', expect.stringContaining('INTERNAL'));
        });
    });

    describe('ListPhotos', () => {
        it('passes the album, cursor and limit through and answers with the page', async () => {
            const reply = await handlers().handleListPhotos(
                message('ListPhotos', { albumId: 'a1', after: '60:p60', limit: 60 })
            );

            expect(library.listPhotos).toHaveBeenCalledWith({ albumId: 'a1', after: '60:p60', limit: 60 });
            expect(reply).toEqual({ type: 'OnListPhotos', success: true, data: page });
        });

        it('rejects a request without a numeric limit before reaching native code', async () => {
            const reply = await handlers().handleListPhotos(message('ListPhotos', { limit: '60' }));

            expect(library.listPhotos).not.toHaveBeenCalled();
            expect(reply).toMatchObject({ type: 'OnListPhotos', success: false, error: { code: 'INVALID' } });
        });

        it('treats a missing payload as a bad request rather than throwing', async () => {
            const reply = await handlers().handleListPhotos(message('ListPhotos', undefined));

            expect(reply).toMatchObject({ success: false, error: { code: 'INVALID' } });
        });
    });

    describe('ReadPhoto', () => {
        it('reads the photo by id and answers with its bytes', async () => {
            const reply = await handlers().handleReadPhoto(message('ReadPhoto', { id: 'p1' }));

            expect(library.readPhoto).toHaveBeenCalledWith('p1');
            expect(reply).toEqual({ type: 'OnReadPhoto', success: true, data: photo });
        });

        it('carries a named native error code into the reply', async () => {
            library.readPhoto.mockRejectedValueOnce(rejection('PHOTO_MISSING', 'gone'));

            const reply = await handlers().handleReadPhoto(message('ReadPhoto', { id: 'p1' }));

            expect(reply).toEqual({
                type: 'OnReadPhoto',
                success: false,
                error: { code: 'PHOTO_MISSING', message: 'gone' },
            });
        });

        // The web reads NOT_FOUND as "this app has no photo library" and drops the picker for the
        // session; one failed read must not be able to do that.
        it('never forwards NOT_FOUND, reporting it as INTERNAL', async () => {
            library.readPhoto.mockRejectedValueOnce(rejection('NOT_FOUND'));

            const reply = await handlers().handleReadPhoto(message('ReadPhoto', { id: 'p1' }));

            expect(reply).toMatchObject({ success: false, error: { code: 'INTERNAL' } });
        });

        it('reports an error without a code as INTERNAL', async () => {
            library.readPhoto.mockRejectedValueOnce(rejection(undefined, 'crash'));

            const reply = await handlers().handleReadPhoto(message('ReadPhoto', { id: 'p1' }));

            expect(reply).toMatchObject({ success: false, error: { code: 'INTERNAL', message: 'crash' } });
        });

        it('rejects an empty id before reaching native code', async () => {
            const reply = await handlers().handleReadPhoto(message('ReadPhoto', { id: '' }));

            expect(library.readPhoto).not.toHaveBeenCalled();
            expect(reply).toMatchObject({ type: 'OnReadPhoto', success: false, error: { code: 'INVALID' } });
        });
    });

    describe('ManagePhotoSelection', () => {
        it('answers with the access after the sheet closed', async () => {
            const reply = await handlers().handleManagePhotoSelection();

            expect(reply).toEqual({ type: 'OnManagePhotoSelection', success: true, data: { access: 'granted' } });
        });

        it('reports a failure as an error envelope', async () => {
            library.manageSelection.mockRejectedValueOnce(rejection('INTERNAL'));

            const reply = await handlers().handleManagePhotoSelection();

            expect(reply).toMatchObject({
                type: 'OnManagePhotoSelection',
                success: false,
                error: { code: 'INTERNAL' },
            });
        });
    });
});
