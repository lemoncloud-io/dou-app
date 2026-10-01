import type { ILogService } from '../log';
import { BootSplashService } from './BootSplashService';

const logService = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as ILogService;

const setup = () => {
    const splash = { hide: jest.fn().mockResolvedValue(true) };
    const service = new BootSplashService(logService, splash);
    const listener = jest.fn();
    service.subscribe(listener);
    return { service, splash, listener };
};

describe('BootSplashService', () => {
    it('keeps the splash through a handshake from a web build that will report its first screen', () => {
        const { service, splash, listener } = setup();

        service.onWebAppReady({ holdsBootSplash: true });

        expect(splash.hide).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();
    });

    // An older web build never sends FirstScreenReady; waiting for it would keep the splash up to the
    // native safety cap on every launch.
    it('reveals on the handshake of a web build that does not declare it', () => {
        const { service, splash, listener } = setup();

        service.onWebAppReady({});

        expect(splash.hide).toHaveBeenCalledWith(true);
        expect(listener).toHaveBeenCalledWith('handshake');
    });

    it('reveals, faded, when the web reports its first screen', () => {
        const { service, splash, listener } = setup();

        service.onFirstScreenReady();

        expect(splash.hide).toHaveBeenCalledWith(true);
        expect(listener).toHaveBeenCalledWith('first-screen');
    });

    it('reveals when the page fails to load, so the failure is not hidden', () => {
        const { service, listener } = setup();

        service.onLoadFailed();

        expect(listener).toHaveBeenCalledWith('load-error');
    });

    // An Android warm start re-arms the native splash in onCreate while this JS runtime lives on, so a
    // remembered "already revealed" would leave that second splash up until its cap.
    it('asks the native side again on every reveal', () => {
        const { service, splash } = setup();

        service.onFirstScreenReady();
        service.onFirstScreenReady();

        expect(splash.hide).toHaveBeenCalledTimes(2);
    });

    it('stops notifying a listener once it unsubscribes', () => {
        const { service } = setup();
        const listener = jest.fn();
        const unsubscribe = service.subscribe(listener);

        unsubscribe();
        service.onFirstScreenReady();

        expect(listener).not.toHaveBeenCalled();
    });

    // The notification permission prompt waits on this: raised under the held splash, Android plays
    // its activity transition onto an undrawn window (black, then the splash again).
    describe('whenRevealed', () => {
        afterEach(() => jest.useRealTimers());

        it('settles on the first reveal', async () => {
            const { service } = setup();
            const settled = jest.fn();
            void service.whenRevealed().then(settled);

            await Promise.resolve();
            expect(settled).not.toHaveBeenCalled();

            service.onFirstScreenReady();
            await Promise.resolve();
            expect(settled).toHaveBeenCalledTimes(1);
        });

        it('settles at once after a reveal has already happened', async () => {
            const { service } = setup();
            service.onLoadFailed();

            await expect(service.whenRevealed()).resolves.toBeUndefined();
        });

        it('settles on the cap when nothing ever reveals', async () => {
            jest.useFakeTimers();
            const { service } = setup();
            const settled = jest.fn();
            void service.whenRevealed(5000).then(settled);

            jest.advanceTimersByTime(4999);
            await Promise.resolve();
            expect(settled).not.toHaveBeenCalled();

            jest.advanceTimersByTime(1);
            await Promise.resolve();
            expect(settled).toHaveBeenCalledTimes(1);
        });
    });
});
