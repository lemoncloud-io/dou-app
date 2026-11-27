import type { ShellBridge } from './bridge';
import { mobileShellDiagnostics } from './diagnostics';

const bridge = { post: jest.fn(), request: jest.fn(), onEvent: jest.fn(() => () => undefined) };

const shell = () => mobileShellDiagnostics(bridge as unknown as ShellBridge)({ kind: 'shell' });

type DebugGlobal = { CHATIC_APP_DEBUG_MODE?: boolean };

beforeEach(() => {
    jest.resetAllMocks();
    bridge.request.mockResolvedValue({ success: true, data: { size: 0 } });
    delete (window as unknown as DebugGlobal).CHATIC_APP_DEBUG_MODE;
});

describe('mobileShellDiagnostics — the phone app carries them', () => {
    it('names the app icon as the entry point', () => {
        expect(shell()).toMatchObject({ kind: 'shell', entry: 'icon' });
    });

    it('tells the app about an unlock and keeps the injected flag in step with it', () => {
        const { debugMode } = shell();

        debugMode?.set(true);
        expect(bridge.post).toHaveBeenLastCalledWith({ type: 'SetDebugMode', data: { enabled: true } });
        expect((window as unknown as DebugGlobal).CHATIC_APP_DEBUG_MODE).toBe(true);

        debugMode?.set(false);
        expect(bridge.post).toHaveBeenLastCalledWith({ type: 'SetDebugMode', data: { enabled: false } });
        expect((window as unknown as DebugGlobal).CHATIC_APP_DEBUG_MODE).toBe(false);
    });

    it('hands the boot snapshot to the app as it is', () => {
        const snapshot = { marks: { mainStartMs: 1, appRenderMs: 2, sessionInitializedMs: 3 }, assets: [] };

        shell().bootMetrics?.send(snapshot);

        expect(bridge.post).toHaveBeenCalledWith({ type: 'SendBootMetrics', data: snapshot });
    });

    it("reads the app's queued reports", async () => {
        const reports = [{ id: 'a', category: 'webview-crash', detectedAt: 1 }];
        bridge.request.mockResolvedValue({ success: true, data: { reports } });

        await expect(shell().pendingReports?.fetch()).resolves.toEqual(reports);
        expect(bridge.request).toHaveBeenCalledWith({ type: 'FetchPendingReports', data: {} });
        expect(bridge.request.mock.calls[0]).toHaveLength(1);
    });

    it('reads an unanswered queue as empty', async () => {
        bridge.request.mockResolvedValue({ success: false });

        await expect(shell().pendingReports?.fetch()).resolves.toEqual([]);
    });

    it('lets a failed request reject, for the caller to log', async () => {
        bridge.request.mockRejectedValue(new Error('timeout'));

        await expect(shell().pendingReports?.fetch()).rejects.toThrow('timeout');
    });

    it('acknowledges the relayed ids', async () => {
        await shell().pendingReports?.ack(['a', 'b']);

        expect(bridge.request).toHaveBeenCalledWith({ type: 'AckPendingReports', data: { ids: ['a', 'b'] } });
        expect(bridge.request.mock.calls[0]).toHaveLength(1);
    });
});
