import { pageStorageAreas, tabStorageStores } from '@chatic/runtime-hybrid-web';

import { chooseWebRuntime, declareWebRuntime } from './webRuntime';

jest.mock('./viteEnv', () => ({ readBuildValue: () => undefined, sessionMirrorDisabled: () => false }));

describe('which declaration the page boots', () => {
    it('boots web-browser in a plain tab, where the host profile found no bridge', () => {
        expect(chooseWebRuntime({ bridge: null })).toBe('web-browser');
    });

    it.each(['react-native-webview', 'message-handler', 'webkit-message-handler'] as const)(
        'boots web-hybrid wherever a shell bridge was found (%s)',
        bridge => {
            expect(chooseWebRuntime({ bridge })).toBe('web-hybrid');
        }
    );

    it('builds the chosen declaration over the stores it is handed', () => {
        const stores = tabStorageStores(pageStorageAreas());

        expect(declareWebRuntime(stores, { bridge: null }).name).toBe('web-browser');
        expect(declareWebRuntime(stores, { bridge: 'react-native-webview' }).name).toBe('web-hybrid');
    });

    it("reads this page's own host by default — a test page has no shell", () => {
        expect(declareWebRuntime(tabStorageStores(pageStorageAreas())).name).toBe('web-browser');
    });
});
