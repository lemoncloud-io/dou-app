const request = jest.fn();
let native = true;
jest.mock('@chatic/bridges', () => ({
    isNative: () => native,
    logger: { info: jest.fn() },
    webClient: {
        request: (message: unknown) => request(message),
        onEvent: () => () => undefined,
    },
}));

import { act, renderHook } from '@testing-library/react';

import { shellCapabilities } from './shellCapabilities';
import { syncShellDownloads, useShellDownloadCatchUp } from './shellDownload';

let foreground: () => void = () => undefined;
jest.mock('./useAppForeground', () => ({
    useAppForeground: (handler: () => void) => {
        foreground = handler;
    },
}));

describe('syncShellDownloads', () => {
    beforeEach(() => {
        native = true;
        request.mockReset().mockResolvedValue({ data: { transfers: [] } });
    });

    it('sends one list request for calls that overlap, and a new one after it ends', async () => {
        await Promise.all([syncShellDownloads(), syncShellDownloads(), syncShellDownloads()]);
        expect(request).toHaveBeenCalledTimes(1);

        await syncShellDownloads();
        expect(request).toHaveBeenCalledTimes(2);
    });

    it('asks nothing in a browser', async () => {
        native = false;

        await syncShellDownloads();

        expect(request).not.toHaveBeenCalled();
    });
});

describe('useShellDownloadCatchUp', () => {
    beforeEach(() => {
        native = true;
        request.mockReset().mockResolvedValue({ data: { transfers: [] } });
    });
    afterEach(() => shellCapabilities.reset());

    it('asks nothing until the handshake allows export, then once, and again on each return', async () => {
        renderHook(() => useShellDownloadCatchUp());
        await act(async () => foreground());
        expect(request).not.toHaveBeenCalled();

        await act(async () =>
            shellCapabilities.setReport({
                protocolVersion: '2.3.0',
                supportedWebMessages: ['SaveToPhotoLibrary', 'ShareFile'],
                supportedAppMessages: [],
            })
        );
        expect(request).toHaveBeenCalledTimes(1);

        await act(async () => foreground());
        expect(request).toHaveBeenCalledTimes(2);
        expect(request).toHaveBeenLastCalledWith({ type: 'ListFileTransfers', data: {} });
    });
});
