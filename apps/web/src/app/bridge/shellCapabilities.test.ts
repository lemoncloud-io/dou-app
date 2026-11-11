import { act, renderHook } from '@testing-library/react';

import type { OnWebAppReadyPayload } from '@chatic/bridge-messages';

import {
    shellCapabilities,
    supportsImageExport,
    useCanExportImages,
    useSubWebViewOpenScope,
} from './shellCapabilities';

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

    // The web ships before the shell: the owner's mini app link is offered only where the shell says so.
    it('reports how far the shell opens sub WebViews, and nothing before the handshake', () => {
        const { result } = renderHook(() => useSubWebViewOpenScope());
        expect(result.current).toBeNull();

        act(() => shellCapabilities.setReport({ ...report([]), subWebViewOpenScope: 'anyHttps' }));
        expect(result.current).toBe('anyHttps');

        act(() => shellCapabilities.setReport(report([])));
        expect(result.current).toBeNull();
    });
});
