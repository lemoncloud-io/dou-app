import { renderHook } from '@testing-library/react';
import { Linking } from 'react-native';

import { useDeviceHandler } from './useDeviceHandler';

const deviceService = {
    openDocument: jest.fn(async () => [
        { uri: 'file:///doc/report.pdf', name: 'report.pdf', type: 'application/pdf', size: 42 },
    ]),
    openSettings: jest.fn(async () => true),
    openCamera: jest.fn(async (_options?: unknown) => [] as unknown[]),
};
const logService = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };

jest.mock('../../hooks', () => ({
    useServices: () => ({ deviceService, logService }),
}));

// react-native ships untranspiled ESM; the handler only needs Linking.
jest.mock('react-native', () => ({
    Linking: { openURL: jest.fn(), openSettings: jest.fn() },
}));

// The utils barrel pulls native device info; the handler only needs these two.
jest.mock('../../utils', () => ({
    toContactInfo: (c: unknown) => c,
}));
const mockIsOpenableUrl = jest.fn((_url: unknown) => true);
jest.mock('../utils/urlTrust', () => ({
    isOpenableUrl: (url: unknown) => mockIsOpenableUrl(url),
}));

const readFile = jest.fn(async () => 'aGVsbG8=');
jest.mock('../../bridge', () => ({
    FileManagerBridge: { readFile: (...args: unknown[]) => readFile(...args) },
}));

const pick = (includeBase64: boolean) =>
    renderHook(() => useDeviceHandler()).result.current.handleOpenDocument({
        type: 'OpenDocument',
        data: { allowMultiSelection: false, includeBase64 },
    } as any);

describe('useDeviceHandler handleOpenDocument', () => {
    beforeEach(() => jest.clearAllMocks());

    it('attaches the base64 the upload needs on success', async () => {
        const res: any = await pick(true);

        expect(res.success).toBe(true);
        expect(res.data.documents[0].base64).toBe('aGVsbG8=');
    });

    // A failed read used to ride along as success with base64 undefined — the
    // upload then had nothing to send and no message to show.
    it('reports a failed base64 read instead of a hollow success', async () => {
        readFile.mockRejectedValueOnce(new Error('locked'));

        const res: any = await pick(true);

        expect(res.success).toBe(false);
        expect(res.error.code).toBe('DOC_READ_ERROR');
    });

    it('does not read when the caller did not ask for base64', async () => {
        const res: any = await pick(false);

        expect(res.success).toBe(true);
        expect(readFile).not.toHaveBeenCalled();
    });

    it('reports opening the system settings', async () => {
        const res: any = await renderHook(() => useDeviceHandler()).result.current.handleOpenSettings({
            type: 'OpenSettings',
            data: {},
        } as any);

        expect(res).toEqual({ type: 'OnOpenSettings', success: true });
    });

    // The BLOCKED permission status sends the reader to Settings; a button that
    // silently does nothing strands them there.
    it('reports when the system settings cannot be opened', async () => {
        deviceService.openSettings.mockResolvedValueOnce(false);

        const res: any = await renderHook(() => useDeviceHandler()).result.current.handleOpenSettings({
            type: 'OpenSettings',
            data: {},
        } as any);

        expect(res.success).toBe(false);
        expect(res.error.code).toBe('SETTINGS_ERROR');
    });
});

const openUrl = (url: unknown) =>
    renderHook(() => useDeviceHandler()).result.current.handleOpenURL({ type: 'OpenURL', data: { url } } as any);

describe('useDeviceHandler handleOpenURL', () => {
    beforeEach(() => jest.clearAllMocks());

    // Which schemes pass is urlTrust's to say (and its own tests pin it); what this pins is that a
    // refused URL never reaches the OS, since an intent or another app's scheme would run the
    // payload the page chose.
    it('refuses a URL the scheme check rejects without asking the OS to open it', async () => {
        mockIsOpenableUrl.mockReturnValueOnce(false);

        const res: any = await openUrl('intent://scan#Intent;end');

        expect(mockIsOpenableUrl).toHaveBeenCalledWith('intent://scan#Intent;end');
        expect(Linking.openURL).not.toHaveBeenCalled();
        expect(res).toEqual({
            type: 'OnOpenURL',
            success: false,
            error: { code: 'LINK_NOT_ALLOWED', message: 'This link cannot be opened.' },
        });
    });

    it('opens an allowed URL through the OS', async () => {
        const res: any = await openUrl('https://example.com/a');

        expect(Linking.openURL).toHaveBeenCalledWith('https://example.com/a');
        expect(res).toEqual({ type: 'OnOpenURL', success: true });
    });

    it('reports an allowed URL the OS fails to open', async () => {
        (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('no handler'));

        const res: any = await openUrl('tel:0101234567');

        expect(res.success).toBe(false);
        expect(res.error).toEqual({ code: 'LINK_ERROR', message: 'no handler' });
    });
});

const shoot = (data: unknown) =>
    renderHook(() => useDeviceHandler()).result.current.handleOpenCamera({ type: 'OpenCamera', data } as any);

describe('useDeviceHandler handleOpenCamera', () => {
    beforeEach(() => jest.clearAllMocks());

    it('passes the capture options the page asked for to the camera', async () => {
        await shoot({ mediaType: 'photo', includeBase64: true, maxWidth: 1024, quality: 0.7 });

        expect(deviceService.openCamera).toHaveBeenCalledWith({
            mediaType: 'photo',
            includeBase64: true,
            maxWidth: 1024,
            quality: 0.7,
        });
    });

    it('returns the base64 the picker produced', async () => {
        deviceService.openCamera.mockResolvedValueOnce([
            { uri: 'file:///tmp/qr.jpg', base64: 'aGVsbG8=', width: 1024, height: 768, type: 'image/jpeg' },
        ]);

        const res: any = await shoot({ includeBase64: true, maxWidth: 1024 });

        expect(res.success).toBe(true);
        expect(res.data.assets[0]).toMatchObject({ base64: 'aGVsbG8=', width: 1024, height: 768 });
    });

    it.each([
        ['no data', undefined],
        ['an empty payload', {}],
    ])('opens the camera with no options for %s, as before options were read', async (_label, data) => {
        await shoot(data);

        expect(deviceService.openCamera).toHaveBeenCalledTimes(1);
        expect(deviceService.openCamera.mock.calls[0][0]).toBeUndefined();
    });

    it('keeps the photo default when the page sets options but no media type', async () => {
        await shoot({ includeBase64: true });

        expect(deviceService.openCamera).toHaveBeenCalledWith({ mediaType: 'photo', includeBase64: true });
    });

    it('passes only the fields of OpenCameraPayload', async () => {
        await shoot({ includeBase64: true, cameraType: 'back', saveToPhotos: true, durationLimit: 5, maxHeight: 800 });

        expect(deviceService.openCamera).toHaveBeenCalledWith({
            mediaType: 'photo',
            includeBase64: true,
            cameraType: 'back',
            maxHeight: 800,
        });
    });

    it('reports a camera failure instead of throwing', async () => {
        deviceService.openCamera.mockRejectedValueOnce(new Error('no camera'));

        const res: any = await shoot({ includeBase64: true });

        expect(res).toMatchObject({ success: false, error: { code: 'CAMERA_ERROR', message: 'no camera' } });
    });
});
