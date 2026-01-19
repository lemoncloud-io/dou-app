import { Clock, Globe, Monitor, Wifi, WifiOff } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Badge } from '@chatic/ui-kit/components/ui/badge';
import { Card, CardContent } from '@chatic/ui-kit/components/ui/card';

import type { DeviceStatus, DeviceView } from '../types';

interface DeviceCardProps {
    device: DeviceView;
}

const statusConfig: Record<
    DeviceStatus,
    { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof Wifi }
> = {
    online: {
        label: 'Online',
        variant: 'default',
        icon: Wifi,
    },
    away: {
        label: 'Away',
        variant: 'secondary',
        icon: Clock,
    },
    offline: {
        label: 'Offline',
        variant: 'outline',
        icon: WifiOff,
    },
};

const formatDate = (dateString?: string): string => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export const DeviceCard = ({ device }: DeviceCardProps): JSX.Element => {
    const config = statusConfig[device.status];
    const StatusIcon = config.icon;

    return (
        <Card className={cn('transition-all', device.status === 'offline' && 'opacity-60')}>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium truncate">{device.deviceName || device.deviceId.slice(0, 8)}</span>
                    </div>
                    <Badge variant={config.variant} className="shrink-0">
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {config.label}
                    </Badge>
                </div>

                <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                            {device.deviceId.slice(0, 8)}...
                        </span>
                        {device.platform && <span className="text-xs">{device.platform}</span>}
                    </div>

                    {device.remote && (
                        <div className="flex items-center gap-1.5">
                            <Globe className="h-3 w-3" />
                            <span className="text-xs">{device.remote}</span>
                        </div>
                    )}

                    <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        <span className="text-xs">
                            {device.status === 'online'
                                ? `Connected: ${formatDate(device.connectedAt)}`
                                : `Last seen: ${formatDate(device.lastActivityAt)}`}
                        </span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
