const isNativeMock = jest.fn();
const sendSmsMock = jest.fn();
const copyMessageToClipboardMock = jest.fn();

jest.mock('@chatic/runtime', () => {
    const testing = require('@chatic/runtime/testing');
    return testing.fakeRuntimeModule({
        get links() {
            return isNativeMock()
                ? {
                      ...testing.browserLinks(),
                      kind: 'shell',
                      sms: { compose: (...args: unknown[]) => sendSmsMock(...args) },
                  }
                : testing.browserLinks();
        },
    });
});
jest.mock('@chatic/bridges', () => ({
    logger: { error: jest.fn() },
}));
jest.mock('../../channels/utils/copyMessageToClipboard', () => ({
    copyMessageToClipboard: (...args: unknown[]) => copyMessageToClipboardMock(...args),
}));

import { sendInviteMessage } from './sendInviteMessage';

describe('sendInviteMessage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('네이티브에서 SMS 브릿지가 성공하면 sms를 반환하고 클립보드는 건드리지 않는다', async () => {
        isNativeMock.mockReturnValue(true);
        sendSmsMock.mockResolvedValue({ success: true });

        const result = await sendInviteMessage('01012345678', 'invite body');

        expect(sendSmsMock).toHaveBeenCalledWith('01012345678', 'invite body');
        expect(copyMessageToClipboardMock).not.toHaveBeenCalled();
        expect(result).toBe('sms');
    });

    it('returns sms for the reply an installed shell actually sends, with no data field', async () => {
        isNativeMock.mockReturnValue(true);
        sendSmsMock.mockResolvedValue(undefined);

        const result = await sendInviteMessage('01012345678', 'invite body');

        expect(copyMessageToClipboardMock).not.toHaveBeenCalled();
        expect(result).toBe('sms');
    });

    it('falls back to the clipboard when the SMS request times out', async () => {
        isNativeMock.mockReturnValue(true);
        sendSmsMock.mockRejectedValue({ code: 'TIMEOUT', message: 'Request timed out after 15000ms' });
        copyMessageToClipboardMock.mockResolvedValue(true);

        const result = await sendInviteMessage('01012345678', 'invite body');

        expect(result).toBe('clipboard');
    });

    it('네이티브지만 SMS 브릿지가 success:false면 클립보드로 폴백한다', async () => {
        isNativeMock.mockReturnValue(true);
        sendSmsMock.mockResolvedValue({ success: false });
        copyMessageToClipboardMock.mockResolvedValue(true);

        const result = await sendInviteMessage('01012345678', 'invite body');

        expect(copyMessageToClipboardMock).toHaveBeenCalledWith('invite body');
        expect(result).toBe('clipboard');
    });

    it('네이티브에서 SMS 브릿지가 거부되어도 클립보드로 폴백한다', async () => {
        isNativeMock.mockReturnValue(true);
        sendSmsMock.mockRejectedValue(new Error('NATIVE_NOT_SUPPORTED'));
        copyMessageToClipboardMock.mockResolvedValue(true);

        const result = await sendInviteMessage('01012345678', 'invite body');

        expect(result).toBe('clipboard');
    });

    it('네이티브가 아니면 SMS 브릿지를 시도하지 않고 바로 클립보드를 쓴다', async () => {
        isNativeMock.mockReturnValue(false);
        copyMessageToClipboardMock.mockResolvedValue(true);

        const result = await sendInviteMessage('01012345678', 'invite body');

        expect(sendSmsMock).not.toHaveBeenCalled();
        expect(result).toBe('clipboard');
    });

    it('클립보드 복사마저 실패하면 false를 반환한다(reject하지 않는다)', async () => {
        isNativeMock.mockReturnValue(false);
        copyMessageToClipboardMock.mockResolvedValue(false);

        const result = await sendInviteMessage('01012345678', 'invite body');

        expect(result).toBe(false);
    });

    it('answers false instead of rejecting when the browser refuses the clipboard write', async () => {
        isNativeMock.mockReturnValue(false);
        copyMessageToClipboardMock.mockRejectedValue(new Error('NotAllowedError: Write permission denied.'));

        await expect(sendInviteMessage('01012345678', 'invite body')).resolves.toBe(false);
    });
});
