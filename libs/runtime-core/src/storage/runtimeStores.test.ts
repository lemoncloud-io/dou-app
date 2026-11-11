import { MemoryStore } from '@chatic/storage';

import { runtimeStores } from './runtimeStores';

describe('runtimeStores', () => {
    beforeEach(() => runtimeStores.reset());

    it('refuses the device store before an entry point configures it, and names the fix', () => {
        expect(() => runtimeStores.device()).toThrow(/initAppRuntime/);
    });

    it('serves what the entry point configured, and a second configure replaces it', () => {
        const first = new MemoryStore();
        const second = new MemoryStore();

        runtimeStores.configure({ device: first });
        expect(runtimeStores.device()).toBe(first);

        runtimeStores.configure({ device: second });
        expect(runtimeStores.device()).toBe(second);
    });
});
