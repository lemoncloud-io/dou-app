import { act, renderHook } from '@testing-library/react';

import type { OnWebAppReadyPayload } from '@chatic/app-messages';

import { shellCapabilities, supportsImageExport, useCanExportImages } from './shellCapabilities';

const report = (supportedWebMessages: string[]): OnWebAppReadyPayload => ({
    protocolVersion: '2.3.0',
    supportedWebMessages,
    supportedAppMessages: [],
});

describe('supportsImageExport', () => {
    it('needs both save and share in the handshake', () => {
        expect(supportsImageExport(report([]))).toBe(false);
        expect(supportsImageExport(report(['SaveToPhotoLibrary']))).toBe(false);
        expect(supportsImageExport(report(['ShareFile']))).toBe(false);
        expect(supportsImageExport(report(['StartFileTransfer', 'SaveToPhotoLibrary', 'ShareFile']))).toBe(true);
    });

    it('is off without a report — a browser tab, or before the handshake answers', () => {
        expect(supportsImageExport(null)).toBe(false);
    });
});

describe('shellCapabilities', () => {
    afterEach(() => shellCapabilities.reset());

    it('turns image export on when the report arrives', () => {
        const { result } = renderHook(() => useCanExportImages());
        expect(result.current).toBe(false);

        act(() => shellCapabilities.setReport(report(['SaveToPhotoLibrary', 'ShareFile'])));

        expect(result.current).toBe(true);
    });

    it('stays off for the session once withdrawn, even if the report is set again', () => {
        shellCapabilities.setReport(report(['SaveToPhotoLibrary', 'ShareFile']));
        const { result } = renderHook(() => useCanExportImages());

        act(() => shellCapabilities.withdrawImageExport());
        expect(result.current).toBe(false);

        act(() => shellCapabilities.setReport(report(['SaveToPhotoLibrary', 'ShareFile'])));
        expect(result.current).toBe(false);
    });
});
