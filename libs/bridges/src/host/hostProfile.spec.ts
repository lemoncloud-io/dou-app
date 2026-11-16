import { isNative } from '../common/utils';
import { buildHostProfile, hostProfile, resetHostProfileForTests } from './hostProfile';
import { SHELL_GLOBAL_NAMES } from './shellGlobals';

const post = { postMessage: jest.fn() };

// A host's globals as each shell sets them — the channel only, which is what `isNative()` reads.
const CHANNEL_HOSTS: Array<[string, Record<string, unknown>]> = [
    ['a plain browser tab', {}],
    ['the phone app (React Native WebView)', { ReactNativeWebView: post }],
    ['an Android message handler', { ChaticMessageHandler: post }],
    ['a WebKit message handler', { webkit: { messageHandlers: { ChaticMessageHandler: post } } }],
    ['a handler object without postMessage', { ChaticMessageHandler: {} }],
];

describe('buildHostProfile', () => {
    it('describes no host at all when there is no window', () => {
        const profile = buildHostProfile(undefined);

        expect(profile.bridge).toBeNull();
        expect(Object.values(profile.globals).every(value => value === undefined)).toBe(true);
        expect(profile.storageMedia).toEqual([]);
        expect(profile.runtimeOffer).toBeUndefined();
        expect(profile.capabilities).toEqual({ kind: 'absent' });
    });

    // The legacy rule: a shell that declares nothing is described exactly as `isNative()` saw it.
    describe.each(CHANNEL_HOSTS)('in %s', (_name, channel) => {
        const keys = Object.keys(channel);

        beforeEach(() => Object.assign(window, channel));
        afterEach(() => {
            for (const key of keys) delete (window as unknown as Record<string, unknown>)[key];
        });

        it('has a bridge exactly when isNative() says so', () => {
            const profile = buildHostProfile(window as unknown as Record<string, unknown>);

            expect(profile.bridge !== null).toBe(isNative());
        });
    });

    it('names the channel the phone app uses apart from the other shells', () => {
        expect(buildHostProfile({ ReactNativeWebView: post }).bridge).toBe('react-native-webview');
        expect(buildHostProfile({ ChaticMessageHandler: post }).bridge).toBe('message-handler');
        expect(buildHostProfile({ webkit: { messageHandlers: { ChaticMessageHandler: post } } }).bridge).toBe(
            'webkit-message-handler'
        );
    });

    it('keeps every boot global exactly as injected, and only those', () => {
        const source: Record<string, unknown> = { CHATIC_APP_THEME: 'dark' };
        SHELL_GLOBAL_NAMES.forEach((name, i) => (source[name] = `value-${i}`));

        const profile = buildHostProfile(source);

        SHELL_GLOBAL_NAMES.forEach((name, i) => expect(profile.globals[name]).toBe(`value-${i}`));
        expect('CHATIC_APP_THEME' in profile.globals).toBe(false);
    });

    it('keeps the injected storage media list, and nothing from a value that is not a list', () => {
        expect(buildHostProfile({ CHATIC_APP_STORAGE_MEDIA: ['nativeSecure', 3] }).storageMedia).toEqual([
            'nativeSecure',
        ]);
        expect(buildHostProfile({ CHATIC_APP_STORAGE_MEDIA: 'nativeSecure' }).storageMedia).toEqual([]);
    });

    it('does not follow a later write to the source, and cannot be written itself', () => {
        const offer = { sessionOwner: 'native' };
        const source: Record<string, unknown> = {
            CHATIC_APP_PLATFORM: 'ios',
            CHATIC_APP_STORAGE_MEDIA: ['nativeSecure'],
            CHATIC_APP_RUNTIME: offer,
        };
        const profile = buildHostProfile(source);

        source['CHATIC_APP_PLATFORM'] = 'android';
        (source['CHATIC_APP_STORAGE_MEDIA'] as string[]).push('other');
        offer.sessionOwner = 'web';

        expect(profile.globals.CHATIC_APP_PLATFORM).toBe('ios');
        expect(profile.storageMedia).toEqual(['nativeSecure']);
        expect(profile.runtimeOffer).toEqual({ sessionOwner: 'native' });
        expect(Object.isFrozen(profile)).toBe(true);
        expect(Object.isFrozen(profile.globals)).toBe(true);
        expect(Object.isFrozen(profile.runtimeOffer)).toBe(true);
        // The shell's own object is left alone.
        expect(Object.isFrozen(offer)).toBe(false);
    });
});

it("keeps a value it cannot copy as it is, and does not freeze the shell's object", () => {
    const offer: Record<string, unknown> = { sessionOwner: 'native' };
    offer['self'] = offer;

    const profile = buildHostProfile({ CHATIC_APP_RUNTIME: offer });

    expect(profile.runtimeOffer).toBe(offer);
    expect(Object.isFrozen(offer)).toBe(false);
});

describe('hostProfile', () => {
    afterEach(() => {
        delete window.CHATIC_APP_PLATFORM;
        resetHostProfileForTests();
    });

    it('is built once, from window, and the same object after that', () => {
        window.CHATIC_APP_PLATFORM = 'ios';
        resetHostProfileForTests();

        const first = hostProfile();
        window.CHATIC_APP_PLATFORM = 'android';

        expect(hostProfile()).toBe(first);
        expect(hostProfile().globals.CHATIC_APP_PLATFORM).toBe('ios');
    });
});
