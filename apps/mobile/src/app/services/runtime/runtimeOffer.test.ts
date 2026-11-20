import { nativeRuntimeOffer } from './runtimeOffer';

// Only the contract list is read here; the package's own import graph (sockets, native modules) is not.
jest.mock('@chatic/runtime-mobile/polyfills', () => ({}));
jest.mock('@chatic/runtime-mobile', () => ({ RUNTIME_CONTRACTS: [1, 2] }));

describe('nativeRuntimeOffer', () => {
    it('offers the session under the runtime contracts, without `held` before the runtime holds it', () => {
        expect(nativeRuntimeOffer(false)).toEqual({ sessionOwner: 'native', contracts: [1, 2] });
    });

    it('says `held` once the runtime holds the session in this process', () => {
        expect(nativeRuntimeOffer(true)).toEqual({ sessionOwner: 'native', contracts: [1, 2], held: true });
    });
});
