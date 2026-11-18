import { buildHostProfile, resetHostProfileForTests } from '@chatic/bridges';

import { readWebHostFacts } from './hostFacts';

jest.mock('@chatic/logger', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const globals = window as unknown as Record<string, unknown>;

afterEach(() => {
    delete globals.ReactNativeWebView;
    delete globals.CHATIC_APP_PLATFORM;
    resetHostProfileForTests();
});

describe('readWebHostFacts', () => {
    it('reads the facts of the profile it is handed, as one frozen value', () => {
        const offer = { sessionOwner: 'native', contracts: [1] };
        const profile = buildHostProfile({
            ReactNativeWebView: { postMessage: () => undefined },
            CHATIC_APP_PLATFORM: 'ios',
            CHATIC_APP_STORAGE_MEDIA: ['nativeSecure'],
            CHATIC_APP_RUNTIME: offer,
            CHATIC_APP_CAPABILITIES: { version: 1, shell: { save: true } },
        });

        const facts = readWebHostFacts({ profile });

        expect(facts).toEqual({
            bridge: 'react-native-webview',
            platform: 'ios',
            storageMedia: ['nativeSecure'],
            runtimeOffer: offer,
            capabilities: { kind: 'declared', version: 1, values: { shell: { save: true } } },
        });
        expect(Object.isFrozen(facts)).toBe(true);
    });

    it('reads a plain browser as no bridge, no platform, no media, no offer and no declaration', () => {
        const facts = readWebHostFacts({ profile: buildHostProfile({}) });

        expect(facts).toEqual({
            bridge: null,
            platform: undefined,
            storageMedia: [],
            runtimeOffer: undefined,
            capabilities: { kind: 'absent' },
        });
    });

    it("reads this page's own profile when handed nothing", () => {
        globals.ReactNativeWebView = { postMessage: jest.fn() };
        globals.CHATIC_APP_PLATFORM = 'android';

        expect(readWebHostFacts()).toMatchObject({ bridge: 'react-native-webview', platform: 'android' });
    });
});
