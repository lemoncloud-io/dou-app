import { isNative, webClient } from '@chatic/bridges';

import { copyMessageToClipboard } from './copyMessageToClipboard';

jest.mock('@chatic/bridges', () => ({
    isNative: jest.fn(),
    logger: {
        error: jest.fn(),
    },
    webClient: {
        request: jest.fn(),
    },
}));

const mockClipboard = (writeText: jest.Mock) => {
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
    });
};

describe('copyMessageToClipboard — 메시지 클립보드 복사', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockClipboard(jest.fn().mockResolvedValue(undefined));
    });

    it('native 환경에서는 CopyToClipboard bridge request를 우선 사용한다', async () => {
        (isNative as jest.Mock).mockReturnValue(true);
        (webClient.request as jest.Mock).mockResolvedValueOnce({
            type: 'OnCopyToClipboard',
            success: true,
            data: { copied: true },
        });

        await expect(copyMessageToClipboard('hello')).resolves.toBe(true);

        expect(webClient.request).toHaveBeenCalledWith({
            type: 'CopyToClipboard',
            data: { text: 'hello' },
        });
        expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('일반 브라우저 환경에서는 Clipboard API를 사용한다', async () => {
        (isNative as jest.Mock).mockReturnValue(false);

        await expect(copyMessageToClipboard('hello')).resolves.toBe(true);

        expect(webClient.request).not.toHaveBeenCalled();
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
    });

    it('구버전 native 앱에서 bridge request가 실패하면 Clipboard API fallback을 시도한다', async () => {
        (isNative as jest.Mock).mockReturnValue(true);
        (webClient.request as jest.Mock).mockRejectedValueOnce({
            code: 'NOT_FOUND',
            message: 'handler not found',
        });

        await expect(copyMessageToClipboard('hello')).resolves.toBe(true);

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
    });
});
