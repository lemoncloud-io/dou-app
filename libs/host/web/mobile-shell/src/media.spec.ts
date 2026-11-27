import { browserImages } from '@chatic/host-web-browser';

import type { ShellBridge } from './bridge';
import {
    KEEP_LIBRARY_VIDEO_TIMEOUT_MS,
    MANAGE_PHOTO_SELECTION_TIMEOUT_MS,
    mobileShellMedia,
    PERMISSION_REQUEST_TIMEOUT_MS,
    PHOTO_LIST_TIMEOUT_MS,
    PHOTO_READ_TIMEOUT_MS,
    PICK_TIMEOUT_MS,
    PREPARE_VIDEO_TIMEOUT_MS,
    READ_ATTACHMENT_TIMEOUT_MS,
} from './media';

const bridge = { post: jest.fn(), request: jest.fn(), onEvent: jest.fn(() => () => undefined) };

const shell = () => mobileShellMedia(bridge as unknown as ShellBridge)({ kind: 'shell' });

beforeEach(() => {
    jest.resetAllMocks();
});

describe('mobileShellMedia — the phone app picks', () => {
    it('opens the picker with the request as given, waiting for as long as the person browses', async () => {
        const answer = { items: [], refused: [] };
        bridge.request.mockResolvedValue({ data: answer });
        const input = {
            source: 'document' as const,
            selectionLimit: 3,
            maxBytes: { image: 1, video: 2, file: 3 },
        };

        await expect(shell().picker?.pick(input)).resolves.toBe(answer);
        expect(bridge.request).toHaveBeenCalledWith(
            { type: 'PickAttachments', data: input },
            { timeoutMs: PICK_TIMEOUT_MS }
        );
        expect(PICK_TIMEOUT_MS).toBe(30 * 60_000);
    });

    it('reads one picked photo by its address, and passes a refusal through', async () => {
        const photo = { base64: 'AAA', mimeType: 'image/jpeg', fileName: 'p.jpg', width: 1, height: 1 };
        bridge.request.mockResolvedValueOnce({ data: photo });

        await expect(shell().picker?.read('file:///c/attach-pick/p.jpg')).resolves.toBe(photo);
        expect(bridge.request).toHaveBeenCalledWith(
            { type: 'ReadAttachment', data: { uri: 'file:///c/attach-pick/p.jpg' } },
            { timeoutMs: READ_ATTACHMENT_TIMEOUT_MS }
        );
        expect(READ_ATTACHMENT_TIMEOUT_MS).toBe(2 * 60_000);

        const gone = Object.assign(new Error('gone'), { code: 'SOURCE' });
        bridge.request.mockRejectedValueOnce(gone);
        await expect(shell().picker?.read('u')).rejects.toBe(gone);
    });

    it('converts a kept video, waiting as long as a long video takes', async () => {
        const prepared = { file: { uri: 'u.mp4' }, poster: null };
        bridge.request.mockResolvedValue({ data: prepared });

        await expect(shell().videoConverter?.prepare('file:///c/a.MOV')).resolves.toBe(prepared);
        expect(bridge.request).toHaveBeenCalledWith(
            { type: 'PrepareVideo', data: { uri: 'file:///c/a.MOV' } },
            { timeoutMs: PREPARE_VIDEO_TIMEOUT_MS }
        );
        expect(PREPARE_VIDEO_TIMEOUT_MS).toBe(10 * 60_000);
    });

    it("reads the photo library through the app, handing back each answer's data", async () => {
        const { photoLibrary } = shell();
        bridge.request
            .mockResolvedValueOnce({ data: 'albums' })
            .mockResolvedValueOnce({ data: 'page' })
            .mockResolvedValueOnce({ data: 'photo' })
            .mockResolvedValueOnce({ data: 'kept' })
            .mockResolvedValueOnce({ data: { access: 'limited' } });

        await expect(photoLibrary?.albums({ thumbSize: 192, mediaTypes: ['image'] })).resolves.toBe('albums');
        await expect(photoLibrary?.photos({ limit: 4, after: 'c1' })).resolves.toBe('page');
        await expect(photoLibrary?.read('p1')).resolves.toBe('photo');
        await expect(photoLibrary?.keepVideo('v1')).resolves.toBe('kept');
        await expect(photoLibrary?.manageSelection()).resolves.toEqual({ access: 'limited' });

        expect(bridge.request.mock.calls).toEqual([
            [
                { type: 'ListPhotoAlbums', data: { thumbSize: 192, mediaTypes: ['image'] } },
                { timeoutMs: PHOTO_LIST_TIMEOUT_MS },
            ],
            [{ type: 'ListPhotos', data: { limit: 4, after: 'c1' } }, { timeoutMs: PHOTO_LIST_TIMEOUT_MS }],
            [{ type: 'ReadPhoto', data: { id: 'p1' } }, { timeoutMs: PHOTO_READ_TIMEOUT_MS }],
            [{ type: 'KeepLibraryVideo', data: { id: 'v1' } }, { timeoutMs: KEEP_LIBRARY_VIDEO_TIMEOUT_MS }],
            [{ type: 'ManagePhotoSelection', data: {} }, { timeoutMs: MANAGE_PHOTO_SELECTION_TIMEOUT_MS }],
        ]);
        expect(PHOTO_LIST_TIMEOUT_MS).toBe(60_000);
        expect(PHOTO_READ_TIMEOUT_MS).toBe(120_000);
        expect(KEEP_LIBRARY_VIDEO_TIMEOUT_MS).toBe(10 * 60_000);
        expect(MANAGE_PHOTO_SELECTION_TIMEOUT_MS).toBe(300_000);
    });

    it('lists every album when asked with no filter', async () => {
        bridge.request.mockResolvedValue({ data: 'albums' });

        await (shell().photoLibrary?.albums as unknown as () => Promise<unknown>)();

        expect(bridge.request).toHaveBeenCalledWith(
            { type: 'ListPhotoAlbums', data: {} },
            { timeoutMs: PHOTO_LIST_TIMEOUT_MS }
        );
    });

    it('passes a library refusal through as the app coded it', async () => {
        const refusal = Object.assign(new Error('hevc'), { code: 'UNSUPPORTED' });
        bridge.request.mockRejectedValue(refusal);

        await expect(shell().photoLibrary?.keepVideo('v1')).rejects.toBe(refusal);
    });

    it('asks the app for the camera and answers with its status, or null when it names none', async () => {
        bridge.request.mockResolvedValueOnce({ data: { permission: 'CAMERA', status: 'BLOCKED' } });
        await expect(shell().cameraPermission?.request()).resolves.toBe('BLOCKED');
        expect(bridge.request).toHaveBeenCalledWith(
            { type: 'RequestPermission', data: { permission: 'CAMERA' } },
            { timeoutMs: PERMISSION_REQUEST_TIMEOUT_MS }
        );
        expect(PERMISSION_REQUEST_TIMEOUT_MS).toBe(60_000);

        bridge.request.mockResolvedValueOnce({});
        await expect(shell().cameraPermission?.request()).resolves.toBeNull();

        const timeout = Object.assign(new Error('slow'), { code: 'TIMEOUT' });
        bridge.request.mockRejectedValueOnce(timeout);
        await expect(shell().cameraPermission?.request()).rejects.toBe(timeout);
    });

    it('prepares images in the page, as a browser does', () => {
        expect(shell().images).toBe(browserImages);
    });
});
