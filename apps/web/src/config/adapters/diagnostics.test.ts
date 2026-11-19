import type { WebHostFacts } from '@chatic/runtime-web';

import { appBridge } from '../../app/bridge/appBridge';
import { webDiagnostics } from './diagnostics';

jest.mock('../../app/bridge/appBridge', () => ({
    appBridge: {
        setDebugMode: jest.fn(),
        sendBootMetrics: jest.fn(),
        fetchPendingReports: jest.fn(),
        ackPendingReports: jest.fn().mockResolvedValue({ success: true, data: { size: 0 } }),
    },
}));

// Neither side reads the facts; the implementations decide from the side alone.
const facts = {} as WebHostFacts;
const shell = () => webDiagnostics.shell({ kind: 'shell' }, facts);
const browser = () => webDiagnostics.browser({ kind: 'browser' }, facts);

type DebugGlobal = { CHATIC_APP_DEBUG_MODE?: boolean };

beforeEach(() => {
    jest.clearAllMocks();
    delete (window as unknown as DebugGlobal).CHATIC_APP_DEBUG_MODE;
});

describe('webDiagnostics — the phone app carries them', () => {
    it('names the app icon as the entry point', () => {
        expect(shell()).toMatchObject({ kind: 'shell', entry: 'icon' });
    });

    it('tells the app about an unlock and keeps the injected flag in step with it', () => {
        const { debugMode } = shell();

        debugMode?.set(true);
        expect(appBridge.setDebugMode).toHaveBeenLastCalledWith(true);
        expect((window as unknown as DebugGlobal).CHATIC_APP_DEBUG_MODE).toBe(true);

        debugMode?.set(false);
        expect(appBridge.setDebugMode).toHaveBeenLastCalledWith(false);
        expect((window as unknown as DebugGlobal).CHATIC_APP_DEBUG_MODE).toBe(false);
    });

    it('hands the boot snapshot to the app as it is', () => {
        const snapshot = { marks: { mainStartMs: 1, appRenderMs: 2, sessionInitializedMs: 3 }, assets: [] };

        shell().bootMetrics?.send(snapshot);

        expect(appBridge.sendBootMetrics).toHaveBeenCalledWith(snapshot);
    });

    it("reads the app's queued reports", async () => {
        const reports = [{ id: 'a', category: 'webview-crash', detectedAt: 1 }];
        jest.mocked(appBridge.fetchPendingReports).mockResolvedValue({
            success: true,
            data: { reports },
        } as never);

        await expect(shell().pendingReports?.fetch()).resolves.toEqual(reports);
    });

    it('reads an unanswered queue as empty', async () => {
        jest.mocked(appBridge.fetchPendingReports).mockResolvedValue({ success: false } as never);

        await expect(shell().pendingReports?.fetch()).resolves.toEqual([]);
    });

    it('lets a failed request reject, for the caller to log', async () => {
        jest.mocked(appBridge.fetchPendingReports).mockRejectedValue(new Error('timeout'));

        await expect(shell().pendingReports?.fetch()).rejects.toThrow('timeout');
    });

    it('acknowledges the relayed ids', async () => {
        await shell().pendingReports?.ack(['a', 'b']);

        expect(appBridge.ackPendingReports).toHaveBeenCalledWith(['a', 'b']);
    });
});

describe('webDiagnostics — the page carries them', () => {
    it('names the browser as the entry point and has none of the app’s members', () => {
        expect(browser()).toEqual({
            kind: 'browser',
            entry: 'browser',
            debugMode: null,
            bootMetrics: null,
            pendingReports: null,
        });
    });

    it('never reaches the bridge', () => {
        browser();

        expect(appBridge.setDebugMode).not.toHaveBeenCalled();
        expect(appBridge.sendBootMetrics).not.toHaveBeenCalled();
        expect(appBridge.fetchPendingReports).not.toHaveBeenCalled();
    });
});
