import { desktopShellDiagnostics } from './diagnostics';

describe('desktopShellDiagnostics', () => {
    it('names the app icon as the entry point inside the desktop app, which keeps none of the phone app’s members', () => {
        expect(desktopShellDiagnostics({ kind: 'shell' })).toEqual({
            kind: 'shell',
            entry: 'icon',
            debugMode: null,
            bootMetrics: null,
            pendingReports: null,
        });
    });
});
