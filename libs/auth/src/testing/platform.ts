import type { AuthPlatformPorts } from '../platform';

/**
 * The jsdom page the tests run in, typed by hand: this package compiles without the DOM's types, and
 * a test fixture is no reason to bring them back.
 */
interface TestPage {
    location: { search: string };
}

const page = (): TestPage => globalThis as unknown as TestPage;

/**
 * Auth ports for a test, behaving like the jsdom page the tests run in: the address's query string,
 * and a navigation home that goes nowhere. Override either port a case is about.
 */
export const fakeAuthPorts = (overrides: Partial<AuthPlatformPorts> = {}): AuthPlatformPorts => ({
    currentSearch: () => page().location.search,
    leaveToHome: () => undefined,
    ...overrides,
});
