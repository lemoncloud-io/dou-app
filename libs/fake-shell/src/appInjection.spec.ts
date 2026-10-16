import { guardAppInjection, type AppInjectionParams } from './appInjection';

const params: AppInjectionParams = {
    insets: { top: 59, bottom: 34, left: 0, right: 0 },
    keyboardHeight: 0,
    theme: 'light',
    configBag: {},
    deviceInfo: { platform: 'ios' },
};

describe('guardAppInjection', () => {
    it("returns the app's script as the builder produced it", () => {
        const build = guardAppInjection({ getSyncInjectionScript: () => 'window.CHATIC_APP_PLATFORM = "ios";' });

        expect(build(params)).toBe('window.CHATIC_APP_PLATFORM = "ios";');
    });

    it('refuses a script that sets a global to undefined, naming the global', () => {
        const build = guardAppInjection({
            getSyncInjectionScript: () => 'window.CHATIC_APP_PLATFORM = "ios";\nwindow.CHATIC_APP_RUN_ID = undefined;',
        });

        expect(() => build(params)).toThrow("the app's injection script sets CHATIC_APP_RUN_ID to undefined");
    });
});
