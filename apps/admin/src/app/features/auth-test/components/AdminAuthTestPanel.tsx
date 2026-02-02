import { useCallback, useState } from 'react';

import { useWebSocketStore } from '@chatic/socket';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { webCore } from '@chatic/web-core';

import { useAuthMonitorStore } from '../stores';

import type { UseInitAuthWebSocketReturn } from '../hooks/useInitAuthWebSocket';
import type { JSX } from 'react';

interface AdminAuthTestPanelProps {
    deviceId: string;
    ws: UseInitAuthWebSocketReturn;
}

/**
 * Admin Auth Test Panel Component
 * - Connect/disconnect controls
 * - Own auth testing
 */
export const AdminAuthTestPanel = ({ deviceId, ws }: AdminAuthTestPanelProps): JSX.Element => {
    const { isConnected } = useWebSocketStore();
    const { connect, disconnect, sendAuthUpdate } = ws;

    const ownAuthState = useAuthMonitorStore(state => state.ownAuthState);
    const [dryRun, setDryRun] = useState(true);
    const [isLoadingToken, setIsLoadingToken] = useState(false);

    const handleConnect = useCallback(async () => {
        await connect();
    }, [connect]);

    const handleAuthenticate = useCallback(async () => {
        setIsLoadingToken(true);
        try {
            const tokenData = await webCore.getTokenSignature();
            const token = tokenData?.originToken?.identityToken || '';

            sendAuthUpdate({
                token,
                dryRun,
            });
        } catch (error) {
            console.error('Failed to get token:', error);
        } finally {
            setIsLoadingToken(false);
        }
    }, [dryRun, sendAuthUpdate]);

    return (
        <div className="rounded-lg border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
                <span>🔧</span> Admin Controls
            </h3>

            {/* Device ID */}
            <div className="p-2 rounded bg-muted/50">
                <span className="text-[10px] text-muted-foreground">Admin Device ID</span>
                <div className="font-mono text-xs truncate" title={deviceId}>
                    {deviceId}
                </div>
            </div>

            {/* Connection Status */}
            <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-sm">
                    {isConnected ? 'Connected' : 'Disconnected'}
                    {ownAuthState && ` (${ownAuthState})`}
                </span>
            </div>

            {/* dryRun Toggle */}
            <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <div>
                    <span className="text-sm font-medium">Dry Run</span>
                    <p className="text-[10px] text-muted-foreground">Skip validation</p>
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

            {/* Control Buttons */}
            <div className="space-y-2">
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={handleConnect}
                        disabled={isConnected}
                        variant={isConnected ? 'outline' : 'default'}
                    >
                        Connect
                    </Button>
                    <Button
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={disconnect}
                        disabled={!isConnected}
                        variant="destructive"
                    >
                        Disconnect
                    </Button>
                </div>

                <Button
                    size="sm"
                    className="w-full h-8 text-xs"
                    onClick={handleAuthenticate}
                    disabled={!isConnected || ownAuthState === 'authenticated' || isLoadingToken}
                    variant="secondary"
                >
                    {isLoadingToken ? 'Loading...' : 'Authenticate (Admin)'}
                </Button>
            </div>
        </div>
    );
};
