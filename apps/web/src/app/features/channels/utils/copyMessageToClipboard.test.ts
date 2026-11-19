import { copyMessageToClipboard } from './copyMessageToClipboard';

const mockCopyText = jest.fn();
// The host's copy, watched: what each side does is the port's own test.
jest.mock('@chatic/runtime', () => {
    const testing = require('@chatic/runtime/testing');
    return testing.fakeRuntimeModule({
        links: { ...testing.browserLinks(), copyText: (...args: unknown[]) => mockCopyText(...args) },
    });
});

describe('copyMessageToClipboard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('copies nothing for an empty string, and answers false', async () => {
        await expect(copyMessageToClipboard('')).resolves.toBe(false);
        expect(mockCopyText).not.toHaveBeenCalled();
    });

    it("copies through the host and answers with the host's result", async () => {
        mockCopyText.mockResolvedValueOnce(true);
        await expect(copyMessageToClipboard('hello')).resolves.toBe(true);
        expect(mockCopyText).toHaveBeenCalledWith('hello');

        // The app answers a failed copy with false.
        mockCopyText.mockResolvedValueOnce(false);
        await expect(copyMessageToClipboard('hello')).resolves.toBe(false);
    });

    it("lets the page's refusal through, for the caller to report", async () => {
        mockCopyText.mockRejectedValueOnce(new Error('Clipboard API is not available.'));

        await expect(copyMessageToClipboard('hello')).rejects.toThrow('Clipboard API is not available.');
    });
});
