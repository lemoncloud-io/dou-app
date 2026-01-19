import { Loader2, MonitorX } from 'lucide-react';

import { DeviceCard } from './DeviceCard';

import type { DeviceView } from '../types';

interface DeviceListProps {
    devices: DeviceView[];
    isLoading: boolean;
}

export const DeviceList = ({ devices, isLoading }: DeviceListProps): JSX.Element => {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (devices.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <MonitorX className="h-12 w-12 mb-2" />
                <p>No devices connected</p>
            </div>
        );
    }

    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {devices.map(device => (
                <DeviceCard key={device.deviceId} device={device} />
            ))}
        </div>
    );
};
