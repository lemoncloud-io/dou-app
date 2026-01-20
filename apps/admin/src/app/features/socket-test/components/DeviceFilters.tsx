import { Circle, RefreshCw } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Button } from '@chatic/ui-kit/components/ui/button';

import type { DeviceStatusAggr, FilterStatus } from '../types';

interface DeviceFiltersProps {
    filter: FilterStatus;
    onFilterChange: (filter: FilterStatus) => void;
    onRefresh: () => void;
    isRefreshing: boolean;
    statusAggr?: DeviceStatusAggr;
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
    onRefresh,
    isRefreshing,
    statusAggr,
}: DeviceFiltersProps): JSX.Element => {
    const getCount = (value: FilterStatus): number | undefined => {
        if (!statusAggr) return undefined;
        if (value === 'all') {
            return (statusAggr.green ?? 0) + (statusAggr.yellow ?? 0) + (statusAggr.red ?? 0);
        }
        return statusAggr[value];
    };

    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
                {filterOptions.map(option => {
                    const isActive = filter === option.value;
                    const count = getCount(option.value);

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
                            {count !== undefined && (
                                <span
                                    className={cn(
                                        'rounded-full px-1.5 py-0.5 text-xs font-medium',
                                        isActive ? 'bg-primary-foreground/20' : 'bg-muted'
                                    )}
                                >
                                    {count}
                                </span>
                            )}
                        </Button>
                    );
                })}
            </div>

            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing} className="gap-2">
                <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                Refresh
            </Button>
        </div>
    );
};
