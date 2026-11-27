import { resetHostProfileForTests } from '@chatic/bridges';

import { webPlatform } from './webPlatform';

describe('webPlatform.device', () => {
    beforeEach(() => resetHostProfileForTests());
    afterEach(() => {
        delete (window as unknown as { CHATIC_APP_PLATFORM?: string }).CHATIC_APP_PLATFORM;
        resetHostProfileForTests();
    });

    it("reads the shell's platform the page was given", () => {
        (window as unknown as { CHATIC_APP_PLATFORM?: string }).CHATIC_APP_PLATFORM = 'ios';
        expect(webPlatform.device().appPlatform).toBe('ios');
    });

    it("reads the page's own user agent, with no runtime configured", () => {
        expect(webPlatform.device()).toEqual({ appPlatform: undefined, userAgent: navigator.userAgent });
    });
});
