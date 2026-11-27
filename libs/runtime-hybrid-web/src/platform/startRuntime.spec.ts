import { handedInPlatform, resetPlatformForTests } from '@chatic/runtime/api/platform';

import { startRuntime } from './startRuntime';
import { webPlatform } from './webPlatform';

const mockStart = jest.fn(async () => ({ engine: null }));
jest.mock('@chatic/runtime-client', () => ({
    ...jest.requireActual('@chatic/runtime-client'),
    startRuntime: (...args: unknown[]) => mockStart(...(args as [])),
}));

describe('startRuntime', () => {
    afterEach(() => resetPlatformForTests());

    it('hands the hybrid platform in, which reads the shell, before it starts the declared runtime', async () => {
        const declaration = { name: 'test' } as unknown as Parameters<typeof startRuntime>[0];
        mockStart.mockImplementationOnce(async () => {
            expect(handedInPlatform()).toBe(webPlatform);
            return { engine: null };
        });

        await startRuntime(declaration);

        expect(mockStart).toHaveBeenCalledWith(declaration, undefined);
    });
});
