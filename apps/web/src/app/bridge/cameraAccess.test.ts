import { cameraAccess } from './cameraAccess';

const requestPermission = jest.fn();
jest.mock('./appBridge', () => ({
    appBridge: { requestPermission: (...args: unknown[]) => requestPermission(...args) },
}));

const answer = (status: string) => requestPermission.mockResolvedValue({ data: { permission: 'CAMERA', status } });

beforeEach(() => {
    jest.clearAllMocks();
    cameraAccess.reset();
});

describe('cameraAccess', () => {
    it('asks the app for the camera permission', async () => {
        answer('GRANTED');

        await expect(cameraAccess.request()).resolves.toBe('granted');
        expect(requestPermission).toHaveBeenCalledWith('CAMERA');
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

    // The person may allow the camera in Settings and come back, so a refusal is asked again next time.
    it('does not remember a refusal or a missing answer', async () => {
        answer('BLOCKED');
        await cameraAccess.request();
        expect(cameraAccess.isGranted()).toBe(false);

        requestPermission.mockRejectedValue({ code: 'TIMEOUT' });
        await cameraAccess.request();
        expect(cameraAccess.isGranted()).toBe(false);
    });
});
