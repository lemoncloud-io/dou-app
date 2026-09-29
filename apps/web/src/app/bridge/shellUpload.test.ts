const mockIsNative = jest.fn();
const mockRequest = jest.fn();
jest.mock('@chatic/bridges', () => ({
    isNative: () => mockIsNative(),
    logger: { info: jest.fn() },
    webClient: { request: (...args: unknown[]) => mockRequest(...args), onEvent: jest.fn(() => () => undefined) },
}));

import { xhrPut } from '@chatic/data';
import { getShellPut, syncShellTransfers } from './shellUpload';

describe('shellUpload', () => {
    beforeEach(() => jest.clearAllMocks());

    it('uses the page PUT in a browser and asks the shell nothing', async () => {
        mockIsNative.mockReturnValue(false);

        expect(getShellPut()).toBe(xhrPut);
        await syncShellTransfers();
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('uses the native transfer module inside the app, one instance for the page', async () => {
        mockIsNative.mockReturnValue(true);
        mockRequest.mockResolvedValue({ data: { transfers: [] } });

        const first = getShellPut();
        expect(first).not.toBe(xhrPut);
        expect(getShellPut()).toBe(first);
        await syncShellTransfers();
        expect(mockRequest).toHaveBeenCalledWith({ type: 'ListFileTransfers', data: {} });
    });
});
