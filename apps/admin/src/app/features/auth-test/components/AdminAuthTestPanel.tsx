import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Settings } from 'lucide-react';

import { useWebSocketStore } from '@chatic/socket';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { useAuthMonitorStore } from '../stores';

import type { UseInitAuthWebSocketReturn } from '../hooks/useInitAuthWebSocket';
import type { JSX } from 'react';

interface AdminAuthTestPanelProps {
    deviceId: string;
    ws: UseInitAuthWebSocketReturn;
    onRegenerateDeviceId?: () => string;
}

/**
 * Admin Auth Test Panel Component
 * - Connect/disconnect controls
 * - Own auth testing
 * - Scenario test buttons (similar to web)
 */
export const AdminAuthTestPanel = ({ deviceId, ws, onRegenerateDeviceId }: AdminAuthTestPanelProps): JSX.Element => {
    const { t } = useTranslation();
    const { isConnected } = useWebSocketStore();
    const { connect, disconnect, sendAuthUpdate } = ws;

    const ownAuthState = useAuthMonitorStore(state => state.ownAuthState);
    const dryRun = useAuthMonitorStore(state => state.dryRun);
    const setDryRun = useAuthMonitorStore(state => state.setDryRun);
    const clearSessions = useAuthMonitorStore(state => state.clearSessions);
    const clearEventLog = useAuthMonitorStore(state => state.clearEventLog);
    const [customToken, setCustomToken] = useState<string>('test');

    const handleConnect = useCallback(async () => {
        await connect();
    }, [connect]);

    const handleAuthenticate = useCallback(() => {
        sendAuthUpdate({
            token: customToken,
            dryRun,
        });
    }, [customToken, dryRun, sendAuthUpdate]);

    const handleReconnect = useCallback(async () => {
        disconnect();
        clearSessions();
        clearEventLog();
        await connect();
    }, [connect, disconnect, clearSessions, clearEventLog]);

    const handleNewDevice = useCallback(() => {
        disconnect();
        clearSessions();
        clearEventLog();
        onRegenerateDeviceId?.();
    }, [disconnect, clearSessions, clearEventLog, onRegenerateDeviceId]);

    return (
        <div className="rounded-lg border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4" /> {t('authTest.title')}
            </h3>

            {/* Device ID */}
            <div className="p-2 rounded bg-muted/50">
                <span className="text-[10px] text-muted-foreground">{t('authTest.deviceId')}</span>
                <div className="font-mono text-xs truncate" title={deviceId}>
                    {deviceId}
                </div>
            </div>

            {/* Connection Status */}
            <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-sm">
                    {isConnected ? t('authTest.connected') : t('authTest.disconnected')}
                    {ownAuthState && ` (${ownAuthState})`}
                </span>
            </div>

            {/* dryRun Toggle */}
            <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <div>
                    <span className="text-sm font-medium">{t('authTest.dryRunMode')}</span>
                    <p className="text-[10px] text-muted-foreground">{t('authTest.dryRunDesc')}</p>
                </div>
                <button
                    type="button"
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        dryRun ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                    onClick={() => setDryRun(!dryRun)}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            dryRun ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                </button>
            </div>

            {/* Custom Token Input */}
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('authTest.customToken')}</label>
                <input
                    type="text"
                    value={customToken}
                    onChange={e => setCustomToken(e.target.value)}
                    placeholder="test"
                    className="w-full px-2 py-1.5 text-xs rounded border bg-background"
                />
            </div>

            {/* Scenario Buttons */}
            <div className="space-y-2">
                <div className="text-xs text-muted-foreground font-medium">{t('authTest.scenarios')}</div>

                {/* Connect/Disconnect */}
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={handleConnect}
                        disabled={isConnected}
                        variant={isConnected ? 'outline' : 'default'}
                    >
                        1. {t('authTest.connect')}
                    </Button>
                    <Button
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={handleAuthenticate}
                        disabled={!isConnected || ownAuthState === 'authenticated'}
                        variant="default"
                    >
                        2. {t('authTest.authenticate')}
                    </Button>
                </div>

                {/* Invalid Token */}
                <Button
                    size="sm"
                    className="w-full h-8 text-xs"
                    onClick={() => sendAuthUpdate({ token: 'invalid-token', dryRun })}
                    disabled={!isConnected}
                    variant="destructive"
                >
                    3. {t('authTest.sendInvalidToken')}
                </Button>

                {/* Disconnect/Reconnect */}
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={disconnect}
                        disabled={!isConnected}
                        variant="outline"
                    >
                        4a. {t('authTest.disconnect')}
                    </Button>
                    <Button
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={handleReconnect}
                        disabled={isConnected}
                        variant="outline"
                    >
                        4b. {t('authTest.reconnect')}
                    </Button>
                </div>

                {/* New Device */}
                {onRegenerateDeviceId && (
                    <Button size="sm" className="w-full h-8 text-xs" onClick={handleNewDevice} variant="secondary">
                        5. {t('authTest.newDevice')}
                    </Button>
                )}
            </div>
        </div>
    );
};
