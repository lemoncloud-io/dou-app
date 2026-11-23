import type { AuthPlatformPorts } from '../platform';

interface TestPage {
    location: { search: string; origin: string; replace(url: string): void };
}

const page = (): TestPage => globalThis as unknown as TestPage;

export const fakeAuthPorts = (overrides: Partial<AuthPlatformPorts> = {}): AuthPlatformPorts => ({
    currentSearch: () => page().location.search,
    leaveToHome: params => {
        const target = new URL('/', page().location.origin);
        target.search = params.toString();
        page().location.replace(target.toString());
    },
    ...overrides,
});
