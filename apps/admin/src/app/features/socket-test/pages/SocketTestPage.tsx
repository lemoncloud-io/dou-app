import { useCallback } from 'react';

import { AlertCircle, RefreshCw } from 'lucide-react';

import { useWebSocket } from '@chatic/socket';
import { Alert, AlertDescription } from '@chatic/ui-kit/components/ui/alert';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@chatic/ui-kit/components/ui/card';
import { webCore } from '@chatic/web-core';

import { ConnectionStatus, DeviceList } from '../components';
import { useDevices, useSessionId } from '../hooks';

const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT || '';

export const SocketTestPage = (): JSX.Element => {
    const sessionId = useSessionId();

    const tokenProvider = useCallback(async (): Promise<string | null> => {
        try {
            const tokenData = await webCore.getTokenSignature();
            return tokenData?.originToken?.identityToken ?? null;
        } catch (error) {
            console.error('[SocketTest] Failed to get token:', error);
            return null;
        }
    }, []);

    const { connectionId, connectionStatus } = useWebSocket({
        endpoint: WS_ENDPOINT,
        tokenProvider,
        enabled: true,
        logPrefix: '[AdminSocket]',
        sessionId,
    });

    const { data, isLoading, refetch, isFetching, error } = useDevices();

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Socket Test</h1>
                <div className="text-sm text-muted-foreground">Session: {sessionId.slice(0, 8)}...</div>
            </div>

            <ConnectionStatus status={connectionStatus} connectionId={connectionId ?? undefined} />

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Failed to fetch devices: {error.message}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <CardTitle className="text-lg">
                        Connected Devices
                        {data?.total !== undefined && (
                            <span className="ml-2 text-sm font-normal text-muted-foreground">({data.total})</span>
                        )}
                    </CardTitle>
                    <Button onClick={() => void refetch()} variant="outline" size="sm" disabled={isFetching}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent>
                    <DeviceList devices={data?.list ?? []} isLoading={isLoading} />
                </CardContent>
            </Card>
        </div>
    );
};
