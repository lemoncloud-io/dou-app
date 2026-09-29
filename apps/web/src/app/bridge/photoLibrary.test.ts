import { base64ToFile, photoLibrary, photoPreviewSrc } from './photoLibrary';

let mockNative = true;
jest.mock('@chatic/bridges', () => ({ isNative: () => mockNative }));

const listPhotos = jest.fn();
const listPhotoAlbums = jest.fn();
const readPhoto = jest.fn();
const managePhotoSelection = jest.fn();
jest.mock('./appBridge', () => ({
    appBridge: {
        listPhotos: (...args: unknown[]) => listPhotos(...args),
        listPhotoAlbums: (...args: unknown[]) => listPhotoAlbums(...args),
        readPhoto: (...args: unknown[]) => readPhoto(...args),
        managePhotoSelection: (...args: unknown[]) => managePhotoSelection(...args),
    },
}));

const notFound = Object.assign(new Error('no handler'), { code: 'NOT_FOUND' });
const timeout = Object.assign(new Error('slow'), { code: 'TIMEOUT' });

beforeEach(() => {
    jest.clearAllMocks();
    mockNative = true;
    photoLibrary.reset();
});

describe('photoLibrary', () => {
    it('answers null in a browser without asking anything', async () => {
        mockNative = false;

        await expect(photoLibrary.photos({ limit: 4 })).resolves.toBeNull();
        expect(listPhotos).not.toHaveBeenCalled();
        expect(photoLibrary.isUnsupported()).toBe(true);
    });

    it('passes a page through from an app that has the picker', async () => {
        const page = { access: 'granted', items: [{ id: 'p1', thumbBase64: 'AAA' }], next: 'c2' };
        listPhotos.mockResolvedValue({ data: page });

        await expect(photoLibrary.photos({ limit: 4, after: 'c1' })).resolves.toEqual(page);
        expect(listPhotos).toHaveBeenCalledWith({ limit: 4, after: 'c1' });
    });

    // An app built before the picker has no handler. One NOT_FOUND settles it for the session, so
    // the page stops asking and uses its own file input.
    it('learns from NOT_FOUND once and stops asking', async () => {
        listPhotos.mockRejectedValue(notFound);

        await expect(photoLibrary.photos({ limit: 4 })).resolves.toBeNull();
        await expect(photoLibrary.albums()).resolves.toBeNull();

        expect(listPhotos).toHaveBeenCalledTimes(1);
        expect(listPhotoAlbums).not.toHaveBeenCalled();
        expect(photoLibrary.isUnsupported()).toBe(true);
    });

    // A slow round trip is not a verdict: learning from it would take the picker away for the session.
    it('does not learn from a transient failure', async () => {
        listPhotos.mockRejectedValueOnce(timeout).mockResolvedValueOnce({ data: { access: 'granted', items: [] } });

        await expect(photoLibrary.photos({ limit: 4 })).rejects.toBe(timeout);
        expect(photoLibrary.isUnsupported()).toBe(false);
        await expect(photoLibrary.photos({ limit: 4 })).resolves.toEqual({ access: 'granted', items: [] });
    });

    it('reads a picked photo back as a File of the reported type', async () => {
        readPhoto.mockResolvedValue({
            data: { base64: btoa('jpeg-bytes'), mimeType: 'image/jpeg', fileName: 'IMG_1.jpg' },
        });

        const file = await photoLibrary.read({ id: 'p1' });

        expect(readPhoto).toHaveBeenCalledWith('p1');
        expect(file.name).toBe('IMG_1.jpg');
        expect(file.type).toBe('image/jpeg');
        expect(file.size).toBe('jpeg-bytes'.length);
    });

    it('fails a read on a shell without the picker instead of returning nothing', async () => {
        mockNative = false;
        await expect(photoLibrary.read({ id: 'p1' })).rejects.toThrow();
    });

    it('reports the access after the selection sheet closes', async () => {
        managePhotoSelection.mockResolvedValue({ data: { access: 'limited' } });
        await expect(photoLibrary.manageSelection()).resolves.toBe('limited');
    });
});

describe('base64ToFile / photoPreviewSrc', () => {
    it('round-trips the bytes', async () => {
        const file = base64ToFile(btoa('abc'), 'a.png', 'image/png');
        expect(file.size).toBe(3);
        expect(file.type).toBe('image/png');
    });

    it('wraps a preview as a JPEG data URL', () => {
        expect(photoPreviewSrc('QUJD')).toBe('data:image/jpeg;base64,QUJD');
    });
});
