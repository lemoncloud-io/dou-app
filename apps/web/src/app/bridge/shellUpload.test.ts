const mockIsNative = jest.fn();
const mockRequest = jest.fn();
// Who moves files, as the host's `files` port says.
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        get files() {
            return { kind: mockIsNative() ? 'shell' : 'browser' };
        },
    })
);
jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn() },
    webClient: { request: (...args: unknown[]) => mockRequest(...args), onEvent: jest.fn(() => () => undefined) },
}));

import { pageUploadPut } from '../../config/upload';
import { getShellPut, syncShellTransfers } from './shellUpload';

describe('shellUpload', () => {
    beforeEach(() => jest.clearAllMocks());

    it('uses the page PUT in a browser and asks the shell nothing', async () => {
        mockIsNative.mockReturnValue(false);

        expect(getShellPut()).toBe(pageUploadPut);
        await syncShellTransfers();
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('uses the native transfer module inside the app, one instance for the page', async () => {
        mockIsNative.mockReturnValue(true);
        mockRequest.mockResolvedValue({ data: { transfers: [] } });

        const first = getShellPut();
        expect(first).not.toBe(pageUploadPut);
        expect(getShellPut()).toBe(first);
        await syncShellTransfers();
        expect(mockRequest).toHaveBeenCalledWith({ type: 'ListFileTransfers', data: {} });
    });
});
