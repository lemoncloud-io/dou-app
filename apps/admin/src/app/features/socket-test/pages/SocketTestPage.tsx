import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AlertCircle } from 'lucide-react';

import { useWebSocket } from '@chatic/socket';
import { Alert, AlertDescription } from '@chatic/ui-kit/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@chatic/ui-kit/components/ui/card';
import { webCore } from '@chatic/web-core';

import { DeviceFilters, DeviceList, DevicePagination, SocketControls } from '../components';
import { useDevices, useSessionId } from '../hooks';

import type { DeviceStatus, FilterStatus } from '../types';

const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT || '';
const PAGE_SIZE = 10;

const isValidStatus = (value: string | null): value is DeviceStatus => {
    return value === 'green' || value === 'yellow' || value === 'red';
};

export const SocketTestPage = (): JSX.Element => {
    const sessionId = useSessionId();
    const [searchParams, setSearchParams] = useSearchParams();

    const filter: FilterStatus = isValidStatus(searchParams.get('status'))
        ? (searchParams.get('status') as DeviceStatus)
        : 'all';
    const page = Number(searchParams.get('page')) || 0;
    const autoRefresh = searchParams.get('autoRefresh') !== 'false';

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

    const { data, isLoading, refetch, isFetching, error } = useDevices({
        page,
        limit: PAGE_SIZE,
        status: filter === 'all' ? undefined : filter,
        autoRefresh,
    });

    const devices = data?.list ?? [];
    const total = data?.total ?? 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const statusAggr = data?.aggr?.status;

    const handleConnect = useCallback(() => {
        void connect();
    }, [connect]);

    const handleFilterChange = useCallback(
        (newFilter: FilterStatus) => {
            setSearchParams(prev => {
                if (newFilter === 'all') {
                    prev.delete('status');
                } else {
                    prev.set('status', newFilter);
                }
                prev.delete('page');
                return prev;
            });
        },
        [setSearchParams]
    );

    const handlePageChange = useCallback(
        (newPage: number) => {
            setSearchParams(prev => {
                if (newPage === 0) {
                    prev.delete('page');
                } else {
                    prev.set('page', String(newPage));
                }
                return prev;
            });
        },
        [setSearchParams]
    );

    const handleAutoRefreshChange = useCallback(
        (enabled: boolean) => {
            setSearchParams(prev => {
                if (enabled) {
                    prev.delete('autoRefresh');
                } else {
                    prev.set('autoRefresh', 'false');
                }
                return prev;
            });
        },
        [setSearchParams]
    );

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
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Connected Devices</CardTitle>
                        <span className="text-sm text-muted-foreground">Total: {total}</span>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <DeviceFilters
                        filter={filter}
                        onFilterChange={handleFilterChange}
                        autoRefresh={autoRefresh}
                        onAutoRefreshChange={handleAutoRefreshChange}
                        onRefresh={() => void refetch()}
                        isRefreshing={isFetching}
                        statusAggr={statusAggr}
                    />
                    <DeviceList devices={devices} isLoading={isLoading} />
                    {totalPages > 1 && (
                        <DevicePagination currentPage={page} totalPages={totalPages} onPageChange={handlePageChange} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
