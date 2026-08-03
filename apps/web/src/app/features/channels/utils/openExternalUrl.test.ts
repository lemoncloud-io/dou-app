import { isNative } from '@chatic/bridges';

import { appBridge } from '../../../bridge';
import { openExternalUrl } from './openExternalUrl';

jest.mock('@chatic/bridges', () => ({
    isNative: jest.fn(),
}));

jest.mock('../../../bridge', () => ({
    appBridge: { openURL: jest.fn() },
}));

describe('openExternalUrl', () => {
    const open = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        Object.defineProperty(window, 'open', { configurable: true, value: open });
    });

    it('hands the URL to the native shell inside the app', () => {
        (isNative as jest.Mock).mockReturnValue(true);

        openExternalUrl('https://example.com/a');

        expect(appBridge.openURL).toHaveBeenCalledWith('https://example.com/a');
        expect(open).not.toHaveBeenCalled();
    });

    it('opens a new tab in a plain browser', () => {
        (isNative as jest.Mock).mockReturnValue(false);

        openExternalUrl('https://example.com/a');

        expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer');
        expect(appBridge.openURL).not.toHaveBeenCalled();
    });
});
