import { createBootSplashHandlers } from './bootSplashHandlers';

describe('createBootSplashHandlers', () => {
    it('hands FirstScreenReady to the service and sends no reply', async () => {
        const service = { onFirstScreenReady: jest.fn() };
        const { handleFirstScreenReady } = createBootSplashHandlers(service);

        const reply = await handleFirstScreenReady({ type: 'FirstScreenReady', data: {} } as any);

        expect(service.onFirstScreenReady).toHaveBeenCalledTimes(1);
        expect(reply).toBeUndefined();
    });
});
