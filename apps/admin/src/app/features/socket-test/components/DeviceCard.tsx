import { Circle, Clock, Globe, Link, Monitor } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Badge } from '@chatic/ui-kit/components/ui/badge';
import { Card, CardContent } from '@chatic/ui-kit/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@chatic/ui-kit/components/ui/tooltip';

import type { DeviceStatus, DeviceView } from '../types';

interface DeviceCardProps {
    device: DeviceView;
}

const statusConfig: Record<DeviceStatus, { label: string; color: string; badgeClass: string }> = {
    green: {
        label: 'Online',
        color: 'text-green-500',
        badgeClass: 'bg-green-500/10 text-green-600 border-green-500/20',
    },
    yellow: {
        label: 'Away',
        color: 'text-yellow-500',
        badgeClass: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    },
    red: {
        label: 'Offline',
        color: 'text-red-500',
        badgeClass: 'bg-red-500/10 text-red-600 border-red-500/20',
    },
};

const platformIcons: Record<string, string> = {
    web: '🌐',
    macos: '🍎',
    windows: '🪟',
    ios: '📱',
    android: '🤖',
};

const formatTimestamp = (timestamp: number): string => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

const formatDuration = (timestamp: number): string => {
    if (!timestamp) return '-';
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
};

const getDeviceName = (name: string, id: string): string => {
    if (name.startsWith('Mozilla/')) {
        if (name.includes('Chrome')) return 'Chrome Browser';
        if (name.includes('Safari')) return 'Safari Browser';
        if (name.includes('Firefox')) return 'Firefox Browser';
        if (name.includes('Whale')) return 'Whale Browser';
        return 'Web Browser';
    }
    if (name.startsWith('TEST:') || name.startsWith('@name:')) {
        return name.split(':')[1]?.slice(0, 8) || id.slice(0, 8);
    }
    return name || id.slice(0, 8);
};

export const DeviceCard = ({ device }: DeviceCardProps): JSX.Element => {
    const config = statusConfig[device.status];
    const platformIcon = platformIcons[device.platform] || '💻';
    const displayName = getDeviceName(device.name, device.id);
    const isOnline = device.status === 'green';

    return (
        <Card className={cn('transition-all hover:shadow-md', device.status === 'red' && 'opacity-60')}>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-lg">
                            {platformIcon}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="font-medium truncate">{displayName}</span>
                                <Circle className={cn('h-2 w-2 fill-current', config.color)} />
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                <span className="capitalize">{device.platform}</span>
                                <span>•</span>
                                <span>{formatDuration(device.connectedAt)}</span>
                            </div>
                        </div>
                    </div>
                    <Badge variant="outline" className={cn('shrink-0', config.badgeClass)}>
                        {config.label}
                    </Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Monitor className="h-3 w-3" />
                                    <span className="font-mono truncate">{device.id.slice(0, 8)}...</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="font-mono text-xs">{device.id}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Link className="h-3 w-3" />
                                    <span className="font-mono truncate">{device.connId.slice(0, 8)}...</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="font-mono text-xs">{device.connId}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{isOnline ? 'Connected' : 'Disconnected'}</span>
                    </div>

                    <div className="text-muted-foreground">
                        {formatTimestamp(isOnline ? device.connectedAt : device.disconnectedAt)}
                    </div>
                </div>

                {device.name.startsWith('Mozilla/') && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground/60">
                                    <Globe className="h-3 w-3" />
                                    <span className="truncate">{device.name.slice(0, 50)}...</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                                <p className="text-xs break-all">{device.name}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </CardContent>
        </Card>
    );
};
