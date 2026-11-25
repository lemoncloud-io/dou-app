const mockIsNative = jest.fn();
const mockAppCopy = jest.fn();
jest.mock('@chatic/runtime-react', () => {
    const testing = require('@chatic/runtime-react/testing');
    return testing.fakeRuntimeModule({
        get links() {
            return mockIsNative()
                ? { ...testing.browserLinks(), kind: 'shell', copyText: (text: string) => mockAppCopy(text) }
                : testing.browserLinks();
        },
    });
});

import { copyText, copyTextWithResult } from './copyText';

const isNativeMock = mockIsNative;
const copyClipBoardMock = mockAppCopy;

describe('copyText', () => {
    let writeTextMock: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        writeTextMock = jest.fn();
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: writeTextMock },
            configurable: true,
        });
    });

    it('네이티브 셸에서는 브릿지 clipboard로 복사한다', () => {
        isNativeMock.mockReturnValue(true);
        copyText('hello');
        expect(copyClipBoardMock).toHaveBeenCalledWith('hello');
        expect(writeTextMock).not.toHaveBeenCalled();
    });

    it('일반 브라우저에서는 Clipboard API로 복사한다', () => {
        isNativeMock.mockReturnValue(false);
        copyText('hello');
        expect(writeTextMock).toHaveBeenCalledWith('hello');
        expect(copyClipBoardMock).not.toHaveBeenCalled();
    });

    it('값이 없으면(null/빈 문자열) 아무것도 하지 않는다', () => {
        isNativeMock.mockReturnValue(false);
        copyText(null);
        copyText('');
        expect(writeTextMock).not.toHaveBeenCalled();
        expect(copyClipBoardMock).not.toHaveBeenCalled();
    });
});

describe('copyTextWithResult', () => {
    let writeTextMock: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        isNativeMock.mockReturnValue(false);
        writeTextMock = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: writeTextMock },
            configurable: true,
        });
    });

    it('빈 값은 복사하지 않고 실패로 답한다', async () => {
        await expect(copyTextWithResult('')).resolves.toBe(false);
        await expect(copyTextWithResult(null)).resolves.toBe(false);
        await expect(copyTextWithResult(undefined)).resolves.toBe(false);
        expect(copyClipBoardMock).not.toHaveBeenCalled();
    });

    it('웹에서 성공하면 참을 답한다', async () => {
        await expect(copyTextWithResult('hello')).resolves.toBe(true);
        expect(writeTextMock).toHaveBeenCalledWith('hello');
    });

    it('Clipboard API가 아예 없으면 실패로 답한다', async () => {
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });

        await expect(copyTextWithResult('hello')).resolves.toBe(false);
    });

    it('Clipboard API가 거절하면 실패로 답한다', async () => {
        writeTextMock.mockRejectedValue(new Error('Document is not focused.'));

        await expect(copyTextWithResult('hello')).resolves.toBe(false);
    });

    it('앱 안에서는 브릿지 응답을 기다려 참을 답한다', async () => {
        isNativeMock.mockReturnValue(true);
        copyClipBoardMock.mockResolvedValue(true);

        await expect(copyTextWithResult('hello')).resolves.toBe(true);
        expect(copyClipBoardMock).toHaveBeenCalledWith('hello');
        expect(writeTextMock).not.toHaveBeenCalled();
    });

    it('브릿지가 거절하면 실패로 답한다', async () => {
        isNativeMock.mockReturnValue(true);
        copyClipBoardMock.mockResolvedValue(false);

        await expect(copyTextWithResult('hello')).resolves.toBe(false);
    });

    it('answers false, too, if the copy rejects', async () => {
        isNativeMock.mockReturnValue(true);
        copyClipBoardMock.mockRejectedValue(new Error('NOT_FOUND'));

        await expect(copyTextWithResult('hello')).resolves.toBe(false);
    });
});
