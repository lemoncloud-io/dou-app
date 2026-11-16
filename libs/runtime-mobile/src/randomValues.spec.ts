import { assertSecureRandom } from './randomValues';

describe('assertSecureRandom', () => {
    it('passes when crypto.getRandomValues is there', () => {
        expect(() => assertSecureRandom({ crypto: { getRandomValues: () => undefined } })).not.toThrow();
    });

    it.each([
        ['no crypto', {}],
        ['crypto without getRandomValues', { crypto: {} }],
        ['getRandomValues that is not a function', { crypto: { getRandomValues: true } }],
    ])('throws, naming the polyfill entry, with %s', (_case, scope) => {
        expect(() => assertSecureRandom(scope)).toThrow('@chatic/runtime-mobile/polyfills');
    });
});
