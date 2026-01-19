import { Circle, RefreshCw } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { Switch } from '@chatic/ui-kit/components/ui/switch';

import type { FilterStatus } from '../types';

interface DeviceFiltersProps {
    filter: FilterStatus;
    onFilterChange: (filter: FilterStatus) => void;
    autoRefresh: boolean;
    onAutoRefreshChange: (enabled: boolean) => void;
    onRefresh: () => void;
    isRefreshing: boolean;
    counts: {
        total: number;
        green: number;
        yellow: number;
        red: number;
    };
}

const filterOptions: { value: FilterStatus; label: string; color: string }[] = [
    { value: 'all', label: 'All', color: 'bg-gray-400' },
    { value: 'green', label: 'Online', color: 'bg-green-500' },
    { value: 'yellow', label: 'Away', color: 'bg-yellow-500' },
    { value: 'red', label: 'Offline', color: 'bg-red-500' },
];

export const DeviceFilters = ({
    filter,
    onFilterChange,
    autoRefresh,
    onAutoRefreshChange,
    onRefresh,
    isRefreshing,
    counts,
}: DeviceFiltersProps): JSX.Element => {
    const getCount = (value: FilterStatus): number => {
        if (value === 'all') return counts.total;
        return counts[value];
    };

    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
                {filterOptions.map(option => {
                    const count = getCount(option.value);
                    const isActive = filter === option.value;

                    return (
                        <Button
                            key={option.value}
                            variant={isActive ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => onFilterChange(option.value)}
                            className={cn('gap-2', !isActive && 'text-muted-foreground')}
                        >
                            <Circle className={cn('h-2 w-2 fill-current', option.color, 'text-transparent')} />
                            {option.label}
                            <span
                                className={cn(
                                    'rounded-full px-1.5 py-0.5 text-xs font-medium',
                                    isActive ? 'bg-primary-foreground/20' : 'bg-muted'
                                )}
                            >
                                {count}
                            </span>
                        </Button>
                    );
                })}
            </div>

            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={onAutoRefreshChange} />
                    <Label htmlFor="auto-refresh" className="text-sm text-muted-foreground cursor-pointer">
                        Auto (10s)
                    </Label>
                </div>

                <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing} className="gap-2">
                    <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                    Refresh
                </Button>
            </div>
        </div>
    );
};
