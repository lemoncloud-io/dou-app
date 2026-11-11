import { transportPlatform } from './platform';
import { fakeTransportPorts } from './testing/platform';

import type { ITransportPlatform } from './platform';

/** A holder of its own, so a case never inherits what another configured on the shared one. */
const freshPlatform = (): ITransportPlatform => {
    let fresh: ITransportPlatform | undefined;
    jest.isolateModules(() => {
        fresh = (jest.requireActual('./platform') as { transportPlatform: ITransportPlatform }).transportPlatform;
    });
    return fresh as ITransportPlatform;
};

describe('transportPlatform', () => {
    it('refuses to hand out ports before any were configured, and names the fix', () => {
        expect(() => freshPlatform().ports()).toThrow(/createRuntime/);
    });

    it('hands out what was configured, and a second configure replaces it', () => {
        const first = fakeTransportPorts();
        const second = fakeTransportPorts();

        transportPlatform.configure(first);
        expect(transportPlatform.ports()).toBe(first);

        transportPlatform.configure(second);
        expect(transportPlatform.ports()).toBe(second);
    });
});
