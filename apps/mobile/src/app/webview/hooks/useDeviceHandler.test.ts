import { renderHook } from '@testing-library/react';
import { Linking } from 'react-native';

import { useDeviceHandler } from './useDeviceHandler';

const deviceService = {
    openDocument: jest.fn(async () => [
        { uri: 'file:///doc/report.pdf', name: 'report.pdf', type: 'application/pdf', size: 42 },
    ]),
    openSettings: jest.fn(async () => true),
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
