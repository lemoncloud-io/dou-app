import { pushedEventErrors, pushedEvents } from './appEventContract';

// updater.ts reaches electron and electron-updater, neither of which loads under jest. Packaged, so
// startUpdater runs; the feed is a stub whose events the tests fire by hand.
jest.mock('electron', () => ({
    app: { isPackaged: true, on: jest.fn(), getPath: () => 'logs', getVersion: () => '1.0.0' },
    powerMonitor: { on: jest.fn() },
}));
// The updater's file log is covered by its own suite; here it must not write into the real logs.
jest.mock('./updaterLog', () => {
    const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    return { createUpdaterLog: jest.fn(() => log) };
});
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

type Feed = {
    listeners: Record<string, (...args: unknown[]) => void>;
    quitAndInstall: jest.Mock;
    logger?: unknown;
};

/** A fresh updater per test: its listeners attach once per module, and it remembers the last status. */
const start = (beforeQuit: () => void = jest.fn()) => {
    const host = { pushEvent: jest.fn(), registerHandler: jest.fn() };
    let feed!: Feed;
    let createUpdaterLog!: jest.Mock;
    jest.isolateModules(() => {
        const { startUpdater } = require('./updater');
        feed = require('electron-updater').default.autoUpdater;
        createUpdaterLog = require('./updaterLog').createUpdaterLog;
        startUpdater(host, beforeQuit);
    });
    const handler = (type: string) => host.registerHandler.mock.calls.find(([name]) => name === type)?.[1];
    return {
        host,
        feed,
        createUpdaterLog,
        fire: (event: string, ...args: unknown[]) => feed.listeners[event](...args),
        handler,
    };
};

// startUpdater arms a check loop; no test here needs it to run.
beforeEach(() => jest.spyOn(global, 'setInterval').mockReturnValue(0 as any));
afterEach(() => jest.restoreAllMocks());

describe('updater app → web event contract', () => {
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

describe('updater restart', () => {
    // Close-to-tray swallows the window's close unless the quit guard is flipped first: the installer
    // would start while the app it replaces is still running.
    it('flips the quit guard, then installs with the default arguments', () => {
        const order: string[] = [];
        const { feed, handler } = start(() => order.push('beforeQuit'));
        feed.quitAndInstall.mockImplementation(() => order.push('quitAndInstall'));
        jest.spyOn(global, 'setImmediate').mockImplementation(((run: () => void) => run()) as any);

        handler('RestartToUpdate')();

        expect(order).toEqual(['beforeQuit', 'quitAndInstall']);
        expect(feed.quitAndInstall).toHaveBeenCalledWith();
    });
});

describe('updater log', () => {
    // Without a logger electron-updater writes to the console, which a packaged app does not have.
    it('gives the feed the file log, opened with the version and the executable', () => {
        const { feed, createUpdaterLog } = start();
        const log = createUpdaterLog.mock.results[0].value;

        expect(createUpdaterLog).toHaveBeenCalledWith('logs');
        expect(feed.logger).toBe(log);
        expect(log.info).toHaveBeenCalledWith(`Updater started: version 1.0.0, running ${process.execPath}`);
    });
});
