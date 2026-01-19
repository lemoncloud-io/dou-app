import { Link2, Link2Off, Server } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Card, CardContent } from '@chatic/ui-kit/components/ui/card';

import type { ConnectionStatus } from '@chatic/socket';

interface SocketControlsProps {
    status: ConnectionStatus;
    endpoint: string;
    sessionId: string;
    connectionId?: string;
    onConnect: () => void;
    onDisconnect: () => void;
}

const statusConfig: Record<ConnectionStatus, { label: string; color: string; dotColor: string }> = {
    connected: {
        label: 'Connected',
        color: 'text-green-600 dark:text-green-400',
        dotColor: 'bg-green-500',
    },
    connecting: {
        label: 'Connecting...',
        color: 'text-yellow-600 dark:text-yellow-400',
        dotColor: 'bg-yellow-500 animate-pulse',
    },
    disconnected: {
        label: 'Disconnected',
        color: 'text-gray-500',
        dotColor: 'bg-gray-400',
    },
    error: {
        label: 'Error',
        color: 'text-red-600 dark:text-red-400',
        dotColor: 'bg-red-500',
    },
};

export const SocketControls = ({
    status,
    endpoint,
    sessionId,
    connectionId,
    onConnect,
    onDisconnect,
}: SocketControlsProps): JSX.Element => {
    const config = statusConfig[status];
    const isConnected = status === 'connected';
    const isConnecting = status === 'connecting';

    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className={cn('h-2.5 w-2.5 rounded-full', config.dotColor)} />
                            <span className={cn('font-semibold', config.color)}>{config.label}</span>
                            {connectionId && (
                                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                    {connectionId}
                                </span>
                            )}
                        </div>

                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                                <Server className="h-3 w-3" />
                                <span className="font-mono">{endpoint || 'Not configured'}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">Session:</span>
                                <span className="font-mono">{sessionId.slice(0, 8)}...</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {isConnected ? (
                            <Button variant="outline" size="sm" onClick={onDisconnect} className="gap-2">
                                <Link2Off className="h-4 w-4" />
                                Disconnect
                            </Button>
                        ) : (
                            <Button
                                variant="default"
                                size="sm"
                                onClick={onConnect}
                                disabled={isConnecting}
                                className="gap-2"
                            >
                                <Link2 className={cn('h-4 w-4', isConnecting && 'animate-pulse')} />
                                {isConnecting ? 'Connecting...' : 'Connect'}
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
