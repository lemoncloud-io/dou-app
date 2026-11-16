import type { AuthPlatformPorts } from '../platform';

/**
 * The jsdom page the tests run in, typed by hand: this package compiles without the DOM's types, and
 * a test fixture is no reason to bring them back.
 */
interface TestPage {
    location: { search: string; origin: string; replace(url: string): void };
}

const page = (): TestPage => globalThis as unknown as TestPage;

/**
 * Auth ports for a test, behaving like the jsdom page the tests run in: the address's query string,
 * and a navigation home through `window.location.replace` (which jsdom reports as not implemented and
 * does not perform). Override either port a case is about.
 */
export const fakeAuthPorts = (overrides: Partial<AuthPlatformPorts> = {}): AuthPlatformPorts => ({
    currentSearch: () => page().location.search,
    leaveToHome: params => {
        const target = new URL('/', page().location.origin);
        target.search = params.toString();
        page().location.replace(target.toString());
    },
    ...overrides,
});
