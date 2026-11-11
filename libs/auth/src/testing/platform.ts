import type { AuthPlatformPorts } from '../platform';

/**
 * Auth ports for a test, behaving like the jsdom page the tests run in: the address's query string,
 * and a navigation home through `window.location.replace` (which jsdom reports as not implemented and
 * does not perform). Override either port a case is about.
 */
export const fakeAuthPorts = (overrides: Partial<AuthPlatformPorts> = {}): AuthPlatformPorts => ({
    currentSearch: () => window.location.search,
    leaveToHome: params => {
        const target = new URL('/', window.location.origin);
        target.search = params.toString();
        window.location.replace(target.toString());
    },
    ...overrides,
});
