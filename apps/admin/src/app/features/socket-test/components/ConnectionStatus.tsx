import { Circle, Loader2 } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Card, CardContent } from '@chatic/ui-kit/components/ui/card';

import type { ConnectionStatus as ConnectionStatusType } from '@chatic/socket';

interface ConnectionStatusProps {
    status: ConnectionStatusType;
    connectionId?: string;
}

const statusConfig: Record<ConnectionStatusType, { label: string; color: string; bgColor: string }> = {
    connected: {
        label: 'Connected',
        color: 'text-green-500',
        bgColor: 'bg-green-500',
    },
    connecting: {
        label: 'Connecting...',
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-500',
    },
    disconnected: {
        label: 'Disconnected',
        color: 'text-gray-400',
        bgColor: 'bg-gray-400',
    },
    error: {
        label: 'Error',
        color: 'text-red-500',
        bgColor: 'bg-red-500',
    },
};

export const ConnectionStatus = ({ status, connectionId }: ConnectionStatusProps): JSX.Element => {
    const config = statusConfig[status];

    return (
        <Card>
            <CardContent className="flex items-center gap-4 py-4">
                <div className="flex items-center gap-2">
                    {status === 'connecting' ? (
                        <Loader2 className={cn('h-4 w-4 animate-spin', config.color)} />
                    ) : (
                        <Circle className={cn('h-3 w-3 fill-current', config.color)} />
                    )}
                    <span className={cn('font-medium', config.color)}>{config.label}</span>
                </div>
                {connectionId && <span className="text-sm text-muted-foreground">ID: {connectionId}</span>}
            </CardContent>
        </Card>
    );
};
