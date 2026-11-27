import { webClient } from '@chatic/bridges';
import type { WebHostFacts } from '@chatic/runtime-hybrid-web';

import { appBridge } from '../../app/bridge/appBridge';
import { PICK_TIMEOUT_MS, PREPARE_VIDEO_TIMEOUT_MS, READ_ATTACHMENT_TIMEOUT_MS, webMedia } from './media';

jest.mock('@chatic/bridges', () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
    webClient: { request: jest.fn() },
}));
jest.mock('../../app/bridge/appBridge', () => ({
    appBridge: {
        listPhotoAlbums: jest.fn(),
        listPhotos: jest.fn(),
        readPhoto: jest.fn(),
        keepLibraryVideo: jest.fn(),
        managePhotoSelection: jest.fn(),
        requestPermission: jest.fn(),
    },
}));

const facts = {} as WebHostFacts;
const shell = () => webMedia.shell({ kind: 'shell' }, facts);
const browser = () => webMedia.browser({ kind: 'browser' }, facts);

const request = webClient.request as jest.Mock;
const mocked = <K extends keyof typeof appBridge>(name: K) => appBridge[name] as unknown as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('webMedia — the phone app picks', () => {
    it('opens the picker with the request as given, waiting for as long as the person browses', async () => {
        const answer = { items: [], refused: [] };
        request.mockResolvedValue({ data: answer });
        const input = {
            source: 'document' as const,
            selectionLimit: 3,
            maxBytes: { image: 1, video: 2, file: 3 },
        };

        await expect(shell().picker?.pick(input)).resolves.toBe(answer);
        expect(request).toHaveBeenCalledWith({ type: 'PickAttachments', data: input }, { timeoutMs: PICK_TIMEOUT_MS });
    });

    it('reads one picked photo by its address, and passes a refusal through', async () => {
        const photo = { base64: 'AAA', mimeType: 'image/jpeg', fileName: 'p.jpg', width: 1, height: 1 };
        request.mockResolvedValueOnce({ data: photo });

        await expect(shell().picker?.read('file:///c/attach-pick/p.jpg')).resolves.toBe(photo);
        expect(request).toHaveBeenCalledWith(
            { type: 'ReadAttachment', data: { uri: 'file:///c/attach-pick/p.jpg' } },
            { timeoutMs: READ_ATTACHMENT_TIMEOUT_MS }
        );

        const gone = Object.assign(new Error('gone'), { code: 'SOURCE' });
        request.mockRejectedValueOnce(gone);
        await expect(shell().picker?.read('u')).rejects.toBe(gone);
    });

    it('converts a kept video, waiting as long as a long video takes', async () => {
        const prepared = { file: { uri: 'u.mp4' }, poster: null };
        request.mockResolvedValue({ data: prepared });

        await expect(shell().videoConverter?.prepare('file:///c/a.MOV')).resolves.toBe(prepared);
        expect(request).toHaveBeenCalledWith(
            { type: 'PrepareVideo', data: { uri: 'file:///c/a.MOV' } },
            { timeoutMs: PREPARE_VIDEO_TIMEOUT_MS }
        );
    });

    it("reads the photo library through the app, handing back each answer's data", async () => {
        const { photoLibrary } = shell();
        mocked('listPhotoAlbums').mockResolvedValue({ data: 'albums' });
        mocked('listPhotos').mockResolvedValue({ data: 'page' });
        mocked('readPhoto').mockResolvedValue({ data: 'photo' });
        mocked('keepLibraryVideo').mockResolvedValue({ data: 'kept' });
        mocked('managePhotoSelection').mockResolvedValue({ data: { access: 'limited' } });

        await expect(photoLibrary?.albums({ thumbSize: 192, mediaTypes: ['image'] })).resolves.toBe('albums');
        await expect(photoLibrary?.photos({ limit: 4, after: 'c1' })).resolves.toBe('page');
        await expect(photoLibrary?.read('p1')).resolves.toBe('photo');
        await expect(photoLibrary?.keepVideo('v1')).resolves.toBe('kept');
        await expect(photoLibrary?.manageSelection()).resolves.toEqual({ access: 'limited' });

        expect(appBridge.listPhotoAlbums).toHaveBeenCalledWith({ thumbSize: 192, mediaTypes: ['image'] });
        expect(appBridge.listPhotos).toHaveBeenCalledWith({ limit: 4, after: 'c1' });
        expect(appBridge.readPhoto).toHaveBeenCalledWith('p1');
        expect(appBridge.keepLibraryVideo).toHaveBeenCalledWith('v1');
        expect(appBridge.managePhotoSelection).toHaveBeenCalledWith();
    });

    it('passes a library refusal through as the app coded it', async () => {
        const refusal = Object.assign(new Error('hevc'), { code: 'UNSUPPORTED' });
        mocked('keepLibraryVideo').mockRejectedValue(refusal);

        await expect(shell().photoLibrary?.keepVideo('v1')).rejects.toBe(refusal);
    });

    it('asks the app for the camera and answers with its status, or null when it names none', async () => {
        mocked('requestPermission').mockResolvedValueOnce({ data: { permission: 'CAMERA', status: 'BLOCKED' } });
        await expect(shell().cameraPermission?.request()).resolves.toBe('BLOCKED');
        expect(appBridge.requestPermission).toHaveBeenCalledWith('CAMERA');

        mocked('requestPermission').mockResolvedValueOnce({});
        await expect(shell().cameraPermission?.request()).resolves.toBeNull();

        const timeout = Object.assign(new Error('slow'), { code: 'TIMEOUT' });
        mocked('requestPermission').mockRejectedValueOnce(timeout);
        await expect(shell().cameraPermission?.request()).rejects.toBe(timeout);
    });
});

describe('webMedia — a browser picks with its own input', () => {
    it('has none of the app’s pieces, and asks the app nothing', () => {
        expect(browser()).toEqual({
            kind: 'browser',
            picker: null,
            photoLibrary: null,
            videoConverter: null,
            cameraPermission: null,
        });
        expect(request).not.toHaveBeenCalled();
    });
});
