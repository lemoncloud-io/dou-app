// `jest.mock` is hoisted above this import, so the bridge reads the mocked module.
import { AttachmentPickerBridge } from './AttachmentPickerBridge';

const mockPick = jest.fn();
const mockPrepareVideo = jest.fn();
const mockReadAttachment = jest.fn();
const mockReadVideoFrame = jest.fn();

jest.mock('react-native', () => ({
    NativeModules: {
        AttachmentPicker: {
            pick: (...args: unknown[]) => mockPick(...args),
            prepareVideo: (...args: unknown[]) => mockPrepareVideo(...args),
            readAttachment: (...args: unknown[]) => mockReadAttachment(...args),
            readVideoFrame: (...args: unknown[]) => mockReadVideoFrame(...args),
        },
    },
}));

const maxBytes = { image: 1, video: 2, file: 3 };

describe('AttachmentPickerBridge', () => {
    beforeEach(() => {
        mockPick.mockReset();
        mockPrepareVideo.mockReset();
    });

    it('is available where the native module exists', () => {
        expect(AttachmentPickerBridge.isAvailable).toBe(true);
    });

    it('passes the pick arguments to native as they are and returns its answer', async () => {
        mockPick.mockResolvedValue({ items: [], refused: [] });

        await expect(AttachmentPickerBridge.pick('document', 4, maxBytes)).resolves.toEqual({ items: [], refused: [] });
        expect(mockPick).toHaveBeenCalledWith('document', 4, maxBytes);
    });

    it('passes the uri to native prepareVideo', async () => {
        mockPrepareVideo.mockResolvedValue({ file: {}, poster: null });

        await AttachmentPickerBridge.prepareVideo('file:///attach-pick/a/v.mov');

        expect(mockPrepareVideo).toHaveBeenCalledWith('file:///attach-pick/a/v.mov');
    });

    it('passes the uri to native readAttachment', async () => {
        mockReadAttachment.mockResolvedValue({
            base64: '',
            mimeType: 'image/jpeg',
            fileName: 'a.jpg',
            width: 1,
            height: 1,
        });

        await AttachmentPickerBridge.readAttachment('file:///attach-pick/b/a.jpg');

        expect(mockReadAttachment).toHaveBeenCalledWith('file:///attach-pick/b/a.jpg');
    });
});

describe('AttachmentPickerBridge — video frames', () => {
    it('knows the module has readVideoFrame and passes its arguments through', async () => {
        mockReadVideoFrame.mockResolvedValue({ base64: '', contentType: 'image/jpeg', width: 1, height: 1 });

        expect(AttachmentPickerBridge.canReadVideoFrame).toBe(true);
        await AttachmentPickerBridge.readVideoFrame('https://s3/v.mp4', 500, 400);

        expect(mockReadVideoFrame).toHaveBeenCalledWith('https://s3/v.mp4', 500, 400);
    });
});

describe('AttachmentPickerBridge without the native module', () => {
    it('is unavailable and rejects every call with INTERNAL', async () => {
        jest.resetModules();
        jest.doMock('react-native', () => ({ NativeModules: {} }));

        const { AttachmentPickerBridge: bridge } = await import('./AttachmentPickerBridge');

        expect(bridge.isAvailable).toBe(false);
        await expect(bridge.pick('media', 1, maxBytes)).rejects.toMatchObject({ code: 'INTERNAL' });
        await expect(bridge.prepareVideo('file:///x')).rejects.toMatchObject({ code: 'INTERNAL' });
        await expect(bridge.readAttachment('file:///x')).rejects.toMatchObject({ code: 'INTERNAL' });

        jest.dontMock('react-native');
    });
});

describe('AttachmentPickerBridge on a module from before readVideoFrame', () => {
    it('says it cannot read a frame and rejects one with INTERNAL', async () => {
        jest.resetModules();
        jest.doMock('react-native', () => ({ NativeModules: { AttachmentPicker: { pick: jest.fn() } } }));

        const { AttachmentPickerBridge: bridge } = await import('./AttachmentPickerBridge');

        expect(bridge.isAvailable).toBe(true);
        expect(bridge.canReadVideoFrame).toBe(false);
        await expect(bridge.readVideoFrame('https://s3/v', 500, 400)).rejects.toMatchObject({ code: 'INTERNAL' });

        jest.dontMock('react-native');
    });
});
