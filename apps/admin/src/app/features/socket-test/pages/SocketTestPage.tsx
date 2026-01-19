import { useCallback, useMemo, useState } from 'react';

import { AlertCircle } from 'lucide-react';

import { useWebSocket } from '@chatic/socket';
import { Alert, AlertDescription } from '@chatic/ui-kit/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@chatic/ui-kit/components/ui/card';
import { webCore } from '@chatic/web-core';

import { DeviceFilters, DeviceList, SocketControls } from '../components';
import { useDevices, useSessionId } from '../hooks';

import type { FilterStatus } from '../types';

const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT || '';

export const SocketTestPage = (): JSX.Element => {
    const sessionId = useSessionId();
    const [filter, setFilter] = useState<FilterStatus>('all');
    const [autoRefresh, setAutoRefresh] = useState(true);

    const tokenProvider = useCallback(async (): Promise<string | null> => {
        try {
            const tokenData = await webCore.getTokenSignature();
            return tokenData?.originToken?.identityToken ?? null;
        } catch (error) {
            console.error('[SocketTest] Failed to get token:', error);
            return null;
        }
    }, []);

    const { connectionId, connectionStatus, connect, disconnect } = useWebSocket({
        endpoint: WS_ENDPOINT,
        tokenProvider,
        enabled: true,
        logPrefix: '[AdminSocket]',
        sessionId,
    });

    const { data, isLoading, refetch, isFetching, error } = useDevices(autoRefresh);

    const devices = data?.list ?? [];

    const filteredDevices = useMemo(() => {
        if (filter === 'all') return devices;
        return devices.filter(device => device.status === filter);
    }, [devices, filter]);

    const counts = useMemo(
        () => ({
            total: devices.length,
            green: devices.filter(d => d.status === 'green').length,
            yellow: devices.filter(d => d.status === 'yellow').length,
            red: devices.filter(d => d.status === 'red').length,
        }),
        [devices]
    );

    const handleConnect = useCallback(() => {
        void connect();
    }, [connect]);

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Socket Test</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Monitor WebSocket connections and connected devices
                </p>
            </div>

            <SocketControls
                status={connectionStatus}
                endpoint={WS_ENDPOINT}
                sessionId={sessionId}
                connectionId={connectionId ?? undefined}
                onConnect={handleConnect}
                onDisconnect={disconnect}
            />

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Failed to fetch devices: {error.message}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Connected Devices</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <DeviceFilters
                        filter={filter}
                        onFilterChange={setFilter}
                        autoRefresh={autoRefresh}
                        onAutoRefreshChange={setAutoRefresh}
                        onRefresh={() => void refetch()}
                        isRefreshing={isFetching}
                        counts={counts}
                    />
                    <DeviceList devices={filteredDevices} isLoading={isLoading} />
                </CardContent>
            </Card>
        </div>
    );
};
