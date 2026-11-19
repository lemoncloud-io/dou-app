const mockFiles = jest.fn();
// Who moves files, as the host's `files` port says.
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        get files() {
            return mockFiles();
        },
    })
);

import { browserFiles } from '@chatic/runtime/testing';

import { getShellFilePut, getShellPut, syncShellTransfers } from './shellUpload';

const appTransfers = () => ({
    putShellFile: jest.fn(),
    syncUploads: jest.fn(async () => undefined),
    openFile: jest.fn(),
    saveFile: jest.fn(),
    readVideoFrame: jest.fn(),
});

describe('shellUpload', () => {
    beforeEach(() => jest.clearAllMocks());

    it("uses the port's PUT in a browser, with no shell-file sender and nothing to catch up on", async () => {
        const files = browserFiles();
        mockFiles.mockReturnValue(files);

        expect(getShellPut()).toBe(files.put);
        expect(getShellFilePut()).toBeUndefined();
        await expect(syncShellTransfers()).resolves.toBeUndefined();
    });

    it("uses the app's transfer module where the app moves files", async () => {
        const transfers = appTransfers();
        const put = jest.fn();
        mockFiles.mockReturnValue({ ...browserFiles(), kind: 'shell', put, transfers });

        expect(getShellPut()).toBe(put);
        expect(getShellFilePut()).toBe(transfers.putShellFile);
        await syncShellTransfers();
        expect(transfers.syncUploads).toHaveBeenCalledTimes(1);
    });

    it('reads the port on every call, so a port published later is the one used', () => {
        mockFiles.mockReturnValue(browserFiles());
        expect(getShellFilePut()).toBeUndefined();

        const transfers = appTransfers();
        mockFiles.mockReturnValue({ ...browserFiles(), kind: 'shell', transfers });
        expect(getShellFilePut()).toBe(transfers.putShellFile);
    });
});
