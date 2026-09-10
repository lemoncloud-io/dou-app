// Mock the bridge modules so the test controls the native/web branch directly.
jest.mock('@chatic/bridges', () => ({ isNative: jest.fn() }));
// Mocked at the direct module path, matching how copyText imports it (the barrel would drag in
// bridge/navigation, which cannot be parsed under ts-jest's CommonJS output).
jest.mock('../../../bridge/appBridge', () => ({ appBridge: { copyClipBoard: jest.fn() } }));

import { isNative } from '@chatic/bridges';

import { appBridge } from '../../../bridge/appBridge';
import { copyText, copyTextWithResult } from './copyText';

const isNativeMock = isNative as jest.Mock;
const copyClipBoardMock = appBridge.copyClipBoard as jest.Mock;

describe('copyText', () => {
    let writeTextMock: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        writeTextMock = jest.fn();
        // jsdom has no navigator.clipboard by default — define it per test.
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

/**
 * `copyTextWithResult` is the path `CopyButton` renders an outcome from, so what matters here is
 * that the boolean is EARNED. Both sides can answer — `CopyToClipboard` is a `webClient.request`,
 * and `writeText` returns a promise — so "복사됨" must never be a guess.
 */
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

    // 비보안 컨텍스트나 낡은 WebView. 옛 구현은 조용히 넘어가 성공처럼 보였다.
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
        copyClipBoardMock.mockResolvedValue({ ok: true });

        await expect(copyTextWithResult('hello')).resolves.toBe(true);
        expect(copyClipBoardMock).toHaveBeenCalledWith('hello');
        expect(writeTextMock).not.toHaveBeenCalled();
    });

    // 구버전 앱의 NOT_FOUND도 여기로 온다 — 복사되지 않았으니 실패가 맞다.
    it('브릿지가 거절하면 실패로 답한다', async () => {
        isNativeMock.mockReturnValue(true);
        copyClipBoardMock.mockRejectedValue(new Error('NOT_FOUND'));

        await expect(copyTextWithResult('hello')).resolves.toBe(false);
    });
});
