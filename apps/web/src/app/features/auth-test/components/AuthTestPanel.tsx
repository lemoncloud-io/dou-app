import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FlaskConical } from 'lucide-react';

import { useWebSocketStore } from '@chatic/socket';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { useAuthStore } from '../stores';

import type { UseInitAuthWebSocketReturn } from '../hooks/useInitAuthWebSocket';
import type { JSX } from 'react';

interface AuthTestPanelProps {
    deviceId: string;
    ws: UseInitAuthWebSocketReturn;
    onRegenerateDeviceId: () => string;
}

/**
 * Auth Test Panel Component
 * - Provides test buttons for each scenario
 * - dryRun toggle
 * - Custom token input
 */
export const AuthTestPanel = ({ deviceId, ws, onRegenerateDeviceId }: AuthTestPanelProps): JSX.Element => {
    const { t } = useTranslation();
    const { isConnected } = useWebSocketStore();
    const { connect, disconnect, sendAuthUpdate } = ws;

    const dryRun = useAuthStore(state => state.dryRun);
    const setDryRun = useAuthStore(state => state.setDryRun);
    const authState = useAuthStore(state => state.authState);
    const reset = useAuthStore(state => state.reset);

    const [customToken, setCustomToken] = useState<string>('test');

    /**
     * Scenario 1: Connect and authenticate
     */
    const handleConnect = useCallback(async () => {
        reset();
        await connect();
    }, [connect, reset]);

    /**
     * Send auth update with token
     */
    const handleAuthenticate = useCallback(() => {
        sendAuthUpdate({
            token: customToken,
            dryRun,
        });
    }, [customToken, dryRun, sendAuthUpdate]);

    /**
     * Scenario 2: Send invalid token (force failure)
     */
    const handleSendInvalidToken = useCallback(() => {
        sendAuthUpdate({
            token: 'invalid-token',
            dryRun,
        });
    }, [sendAuthUpdate, dryRun]);

    /**
     * Scenario 4: Disconnect and reconnect
     */
    const handleDisconnect = useCallback(() => {
        disconnect();
    }, [disconnect]);

    const handleReconnect = useCallback(async () => {
        reset(); // Reset auth state on reconnect
        await connect();
    }, [connect, reset]);

    /**
     * Scenario 3: New device (regenerate deviceId)
     */
    const handleNewDevice = useCallback(() => {
        disconnect();
        reset();
        onRegenerateDeviceId();
    }, [disconnect, reset, onRegenerateDeviceId]);

    return (
        <div className="rounded-lg border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
                <FlaskConical className="h-4 w-4" /> {t('authTest.title')}
            </h3>

            {/* Device ID Display */}
            <div className="p-2 rounded bg-muted/50">
                <span className="text-[10px] text-muted-foreground">{t('authTest.deviceId')}</span>
                <div className="font-mono text-xs truncate" title={deviceId}>
                    {deviceId}
                </div>
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
                    placeholder={t('authTest.customTokenPlaceholder')}
                    className="w-full px-2 py-1.5 text-xs rounded border bg-background"
                />
            </div>

            {/* Scenario Buttons */}
            <div className="space-y-2">
                <div className="text-xs text-muted-foreground font-medium">{t('authTest.scenarios')}</div>

                {/* Scenario 1: Connect */}
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
                        disabled={!isConnected || authState === 'authenticated'}
                        variant="default"
                    >
                        2. {t('authTest.authenticate')}
                    </Button>
                </div>

                {/* Scenario 2: Invalid Token */}
                <Button
                    size="sm"
                    className="w-full h-8 text-xs"
                    onClick={handleSendInvalidToken}
                    disabled={!isConnected}
                    variant="destructive"
                >
                    3. {t('authTest.sendInvalidToken')}
                </Button>

                {/* Scenario 4: Disconnect/Reconnect */}
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={handleDisconnect}
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

                {/* Scenario 3: Multi-device */}
                <Button size="sm" className="w-full h-8 text-xs" onClick={handleNewDevice} variant="secondary">
                    5. {t('authTest.newDevice')}
                </Button>
            </div>

            {/* Help Text */}
            <div className="pt-2 border-t">
                <div className="text-[10px] text-muted-foreground space-y-1">
                    <p>
                        <strong>1:</strong> {t('authTest.help.scenario1')}
                    </p>
                    <p>
                        <strong>2:</strong> {t('authTest.help.scenario2')}
                    </p>
                    <p>
                        <strong>3:</strong> {t('authTest.help.scenario3')}
                    </p>
                    <p>
                        <strong>4:</strong> {t('authTest.help.scenario4')}
                    </p>
                </div>
            </div>
        </div>
    );
};
