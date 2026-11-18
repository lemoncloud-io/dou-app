import { appBridge } from '../../../bridge';
import { copyMessageToClipboard } from './copyMessageToClipboard';

const mockIsNative = jest.fn();
// Who takes the page's links, as the host's `links` port says.
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        get links() {
            return { kind: mockIsNative() ? 'shell' : 'browser' };
        },
    })
);
jest.mock('@chatic/bridges', () => ({
    logger: { error: jest.fn() },
}));

jest.mock('../../../bridge', () => ({
    appBridge: { copyClipBoard: jest.fn() },
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

    it('빈 문자열이면 복사하지 않고 false를 반환한다', async () => {
        await expect(copyMessageToClipboard('')).resolves.toBe(false);
        expect(appBridge.copyClipBoard).not.toHaveBeenCalled();
    });

    it('native 환경에서는 appBridge.copyClipBoard를 사용한다', async () => {
        mockIsNative.mockReturnValue(true);
        (appBridge.copyClipBoard as jest.Mock).mockResolvedValueOnce({ type: 'CopyToClipboard', success: true });

        await expect(copyMessageToClipboard('hello')).resolves.toBeTruthy();

        expect(appBridge.copyClipBoard).toHaveBeenCalledWith('hello');
        expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('일반 브라우저 환경에서는 Clipboard API를 사용한다', async () => {
        mockIsNative.mockReturnValue(false);

        await expect(copyMessageToClipboard('hello')).resolves.toBe(true);

        expect(appBridge.copyClipBoard).not.toHaveBeenCalled();
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
    });

    it('native bridge가 실패하면 false를 반환한다', async () => {
        mockIsNative.mockReturnValue(true);
        (appBridge.copyClipBoard as jest.Mock).mockRejectedValueOnce(new Error('handler not found'));

        await expect(copyMessageToClipboard('hello')).resolves.toBe(false);
    });
});
