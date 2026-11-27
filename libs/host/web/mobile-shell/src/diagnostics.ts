import type { DiagnosticsPort } from '@chatic/ports';

import type { ShellBridge } from './bridge';

export const mobileShellDiagnostics =
    (bridge: ShellBridge) =>
    (base: Pick<DiagnosticsPort, 'kind'>): DiagnosticsPort => ({
        ...base,
        entry: 'icon',
        debugMode: {
            set: enabled => {
                bridge.post({ type: 'SetDebugMode', data: { enabled } });
                (window as unknown as { CHATIC_APP_DEBUG_MODE?: boolean }).CHATIC_APP_DEBUG_MODE = enabled;
            },
        },
        bootMetrics: { send: snapshot => bridge.post({ type: 'SendBootMetrics', data: snapshot }) },
        pendingReports: {
            fetch: async () => {
                const response = await bridge.request({ type: 'FetchPendingReports', data: {} });
                return response.success ? (response.data?.reports ?? []) : [];
            },
            ack: async ids => {
                await bridge.request({ type: 'AckPendingReports', data: { ids } });
            },
        },
    });
