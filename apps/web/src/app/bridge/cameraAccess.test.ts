import { cameraAccess } from './cameraAccess';

const requestPermission = jest.fn();
let mockCameraPermission: { request: () => Promise<unknown> } | null = null;
jest.mock('@chatic/runtime-react', () => {
    const testing = require('@chatic/runtime-react/testing');
    return testing.fakeRuntimeModule({
        get media() {
            return { ...testing.browserMedia(), cameraPermission: mockCameraPermission };
        },
    });
});

const answer = (status: string) => requestPermission.mockResolvedValue(status);

beforeEach(() => {
    jest.clearAllMocks();
    cameraAccess.reset();
    mockCameraPermission = { request: () => requestPermission() };
});

describe('cameraAccess', () => {
    it('asks the app for the camera permission', async () => {
        answer('GRANTED');

        await expect(cameraAccess.request()).resolves.toBe('granted');
        expect(requestPermission).toHaveBeenCalledTimes(1);
    });

    it('answers unknown without asking where the host has no camera permission to give', async () => {
        mockCameraPermission = null;

        await expect(cameraAccess.request()).resolves.toBe('unknown');
        expect(requestPermission).not.toHaveBeenCalled();
    });

    it.each(['DENIED', 'BLOCKED'])('reads %s as a refusal', async status => {
        answer(status);

        await expect(cameraAccess.request()).resolves.toBe('refused');
    });

    it('does not read a missing camera as a refusal', async () => {
        answer('UNAVAILABLE');

        await expect(cameraAccess.request()).resolves.toBe('unknown');
    });

    it('does not read a failed request as a refusal', async () => {
        requestPermission.mockRejectedValue({ code: 'PERMISSION_ERROR', message: 'native threw' });

        await expect(cameraAccess.request()).resolves.toBe('unknown');
    });

    it('remembers a grant for the page', async () => {
        expect(cameraAccess.isGranted()).toBe(false);
        answer('GRANTED');

        await cameraAccess.request();

        expect(cameraAccess.isGranted()).toBe(true);
    });

    it('does not remember a refusal or a missing answer', async () => {
        answer('BLOCKED');
        await cameraAccess.request();
        expect(cameraAccess.isGranted()).toBe(false);

        requestPermission.mockRejectedValue({ code: 'TIMEOUT' });
        await cameraAccess.request();
        expect(cameraAccess.isGranted()).toBe(false);
    });
});
