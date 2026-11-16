import { authPlatform } from './platform';
import { fakeAuthPorts } from './testing/platform';

import type { IAuthPlatform } from './platform';
import type * as PlatformModule from './platform';

/** A holder of its own, so a case never inherits what another configured on the shared one. */
const freshPlatform = (): IAuthPlatform => {
    let fresh: IAuthPlatform | undefined;
    jest.isolateModules(() => {
        fresh = jest.requireActual<typeof PlatformModule>('./platform').authPlatform;
    });
    return fresh as IAuthPlatform;
};

describe('authPlatform', () => {
    it('refuses to hand out ports before any were configured, and names the fix', () => {
        expect(() => freshPlatform().ports()).toThrow(/createRuntime/);
    });

    it('hands out what was configured, and a second configure replaces it', () => {
        const first = fakeAuthPorts();
        const second = fakeAuthPorts();

        authPlatform.configure(first);
        expect(authPlatform.ports()).toBe(first);

        authPlatform.configure(second);
        expect(authPlatform.ports()).toBe(second);
    });
});
