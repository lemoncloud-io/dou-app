// Mock the bridge modules so the test controls the native/web branch directly.
jest.mock('@chatic/bridges', () => ({ isNative: jest.fn() }));
// Mocked at the direct module path, matching how copyText imports it (the barrel would drag in
// bridge/navigation, which cannot be parsed under ts-jest's CommonJS output).
jest.mock('../../../bridge/appBridge', () => ({ appBridge: { copyClipBoard: jest.fn() } }));

import { isNative } from '@chatic/bridges';

import { appBridge } from '../../../bridge/appBridge';
import { copyText } from './copyText';

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
