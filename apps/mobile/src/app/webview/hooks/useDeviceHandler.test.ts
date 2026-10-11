import { renderHook } from '@testing-library/react';

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
jest.mock('../utils/urlTrust', () => ({
    isOpenableUrl: () => true,
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
