import type { DesktopShellBridge } from './bridge';
import { desktopShellAppShell } from './appShell';

const events: Record<string, (message: unknown) => void> = {};
const bridge = {
    post: jest.fn(),
    request: jest.fn(async (_message: unknown): Promise<unknown> => ({ success: true, data: { success: true } })),
    onEvent: jest.fn((type: string, handler: (message: unknown) => void) => {
        events[type] = handler;
        return () => delete events[type];
    }),
};
const asBridge = bridge as unknown as DesktopShellBridge;

const shell = () => desktopShellAppShell(asBridge)({ kind: 'shell', os: null });

beforeEach(() => jest.clearAllMocks());

describe('desktopShellAppShell — the desktop app', () => {
    it('owns its window, and has none of the phone app’s members', () => {
        expect(shell()).toMatchObject({
            kind: 'shell',
            os: null,
            ownsWindow: true,
            reportsKeyboardHeight: false,
            haptics: null,
            preferences: null,
            backGesture: null,
            iconBadge: null,
            appIcon: null,
            storeUpdate: null,
            systemSettings: null,
        });
    });

    it('paints the dock badge through SetBadgeCount, with the overlay PNG Windows needs', async () => {
        await expect(shell().dockBadge?.set(3, 'data:image/png;base64,AA')).resolves.toEqual({
            success: true,
            data: { success: true },
        });

        expect(bridge.request).toHaveBeenCalledWith({
            type: 'SetBadgeCount',
            data: { count: 3, overlayIconDataUrl: 'data:image/png;base64,AA' },
        });
    });

    it('passes each update status the shell announces, skipping an empty one, until unsubscribed', () => {
        const listener = jest.fn();
        const unsubscribe = shell().selfUpdate?.onStatus(listener);

        expect(bridge.onEvent).toHaveBeenCalledWith('OnUpdateStatus', expect.any(Function));
        events['OnUpdateStatus']?.({ data: { status: 'downloading', version: '1.2.0', percent: 40 } });
        events['OnUpdateStatus']?.({});
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({ status: 'downloading', version: '1.2.0', percent: 40 });

        unsubscribe?.();
        expect(events['OnUpdateStatus']).toBeUndefined();
    });

    it('asks the shell to download, then to restart, as one-object posts', () => {
        const selfUpdate = shell().selfUpdate;
        selfUpdate?.startDownload();
        selfUpdate?.restart();

        expect(bridge.post).toHaveBeenNthCalledWith(1, { type: 'StartUpdateDownload', data: {} });
        expect(bridge.post).toHaveBeenNthCalledWith(2, { type: 'RestartToUpdate', data: {} });
    });
});
