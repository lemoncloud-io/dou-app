import { Monitor, Smartphone } from 'lucide-react';

import { cn } from '@chatic/ui-kit';

export type PreviewDevice = 'desktop' | 'mobile';

export const DEVICE_WIDTH: Record<PreviewDevice, string> = {
    desktop: '46rem',
    mobile: '24.375rem',
};

const OPTIONS: { id: PreviewDevice; label: string; Icon: typeof Monitor }[] = [
    { id: 'desktop', label: 'Desktop', Icon: Monitor },
    { id: 'mobile', label: 'Mobile', Icon: Smartphone },
];

interface DeviceToggleProps {
    value: PreviewDevice;
    onValue: (device: PreviewDevice) => void;
}

export const DeviceToggle = ({ value, onValue }: DeviceToggleProps) => (
    <div role="radiogroup" aria-label="Preview width" className="flex items-center gap-0.5 rounded-md bg-well p-0.5">
        {OPTIONS.map(({ id, label, Icon }) => (
            <button
                key={id}
                type="button"
                role="radio"
                aria-checked={value === id}
                title={`${label} width`}
                onClick={() => onValue(id)}
                className={cn(
                    'focus-ring tactile flex items-center gap-1.5 rounded px-2 py-1',
                    'text-micro transition-colors ease-tactile',
                    value === id
                        ? 'bg-background font-semibold text-foreground shadow-raised'
                        : 'text-muted-foreground hover:text-foreground'
                )}
            >
                <Icon size={13} />
                {label}
            </button>
        ))}
    </div>
);
