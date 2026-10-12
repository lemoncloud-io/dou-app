import { pushedEventErrors, pushedEvents } from './appEventContract';

// updater.ts reaches electron and electron-updater, neither of which loads under jest. Packaged, so
// startUpdater runs; the feed is a stub whose events the tests fire by hand.
jest.mock('electron', () => ({ app: { isPackaged: true, on: jest.fn() }, powerMonitor: { on: jest.fn() } }));
jest.mock('electron-updater', () => {
    const listeners: Record<string, (...args: unknown[]) => void> = {};
    return {
        __esModule: true,
        default: {
            autoUpdater: {
                listeners,
                on: jest.fn((event: string, listener: (...args: unknown[]) => void) => (listeners[event] = listener)),
                checkForUpdates: jest.fn(() => Promise.resolve()),
                downloadUpdate: jest.fn(() => Promise.resolve()),
                quitAndInstall: jest.fn(),
            },
        },
    };
});

type Feed = { listeners: Record<string, (...args: unknown[]) => void> };

/** A fresh updater per test: its listeners attach once per module, and it remembers the last status. */
const start = () => {
    const host = { pushEvent: jest.fn(), registerHandler: jest.fn() };
    let feed!: Feed;
    jest.isolateModules(() => {
        const { startUpdater } = require('./updater');
        feed = require('electron-updater').default.autoUpdater;
        startUpdater(host, jest.fn());
    });
    const handler = (type: string) => host.registerHandler.mock.calls.find(([name]) => name === type)?.[1];
    return { host, fire: (event: string, ...args: unknown[]) => feed.listeners[event](...args), handler };
};

describe('updater app → web event contract', () => {
    beforeEach(() => {
        // startUpdater arms a check loop; the contract only needs what it pushes.
        jest.spyOn(global, 'setInterval').mockReturnValue(0 as any);
    });
    afterEach(() => jest.restoreAllMocks());

    it("pushes 'OnUpdateStatus' through an update's whole course", () => {
        const { host, fire, handler } = start();

        fire('update-available', { version: '2.0.0' });
        handler('StartUpdateDownload')();
        fire('download-progress', { percent: 41.6 });
        fire('update-downloaded', { version: '2.0.0' });

        expect(pushedEvents(host.pushEvent).map(pushed => (pushed as { data: unknown }).data)).toEqual([
            { status: 'available', version: '2.0.0' },
            { status: 'downloading', percent: 42 },
            { status: 'downloaded', version: '2.0.0' },
        ]);
        expect(pushedEventErrors(pushedEvents(host.pushEvent))).toEqual([]);
    });

    it("pushes 'OnUpdateStatus' error for a download the user started", () => {
        const { host, fire, handler } = start();

        handler('StartUpdateDownload')();
        fire('error', new Error('disk full'));

        expect(pushedEvents(host.pushEvent)).toEqual([
            expect.objectContaining({ type: 'OnUpdateStatus', data: { status: 'error', message: 'disk full' } }),
        ]);
        expect(pushedEventErrors(pushedEvents(host.pushEvent))).toEqual([]);
    });

    // A background check that fails retries on the next trigger instead of flashing a warning.
    it('pushes nothing for a failed background check', () => {
        const { host, fire } = start();

        fire('error', new Error('offline'));

        expect(host.pushEvent).not.toHaveBeenCalled();
    });
});
