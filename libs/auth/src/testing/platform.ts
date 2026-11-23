import type { AuthPlatformPorts } from '../platform';

interface TestPage {
    location: { search: string };
}

const page = (): TestPage => globalThis as unknown as TestPage;

export const fakeAuthPorts = (overrides: Partial<AuthPlatformPorts> = {}): AuthPlatformPorts => ({
    currentSearch: () => page().location.search,
    leaveToHome: () => undefined,
    ...overrides,
});
