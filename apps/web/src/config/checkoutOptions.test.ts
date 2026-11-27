import type { WebHostFacts } from '@chatic/runtime-hybrid-web';

import { checkoutOptionsOf } from './checkoutOptions';
import { webBrowser } from './webBrowser';
import { webHybrid } from './webHybrid';

const stores = {} as Parameters<typeof webHybrid>[0];

const facts = (checkout: string[]): WebHostFacts => ({
    bridge: 'react-native-webview',
    platform: 'ios',
    storageMedia: [],
    runtimeOffer: undefined,
    capabilities: { kind: 'declared', version: 1, values: { checkout } },
});

describe('checkoutOptionsOf', () => {
    it("offers the hybrid runtime's candidates, and marks the ones a store host does not offer", () => {
        const options = checkoutOptionsOf(webHybrid(stores), facts(['apple']));
        expect(options.map(option => option.id)).toEqual([
            'checkout.host',
            'checkout.store',
            'checkout.web',
            'checkout.none',
        ]);
        expect(options.find(option => option.id === 'checkout.web')?.supported).toBe(false);
        expect(options.find(option => option.id === 'checkout.store')?.supported).toBe(true);
    });

    it('offers a browser tab its one candidate', () => {
        expect(checkoutOptionsOf(webBrowser(stores), facts([])).map(option => option.id)).toEqual(['checkout.host']);
    });
});
