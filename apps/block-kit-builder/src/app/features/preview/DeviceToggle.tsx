import { Monitor, Smartphone } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

/** Which client's width the stage draws the message at. */
export type PreviewDevice = 'desktop' | 'mobile';

/**
 * How wide the message card is allowed to get, per client.
 *
 * Not arbitrary: `mobile` is the 390px logical viewport `apps/web` is drawn for,
 * and `desktop` is the width desktop-web's message column settles at once the
 * sidebar and thread rail have taken theirs. A payload that only reads on one of
 * them is a payload with a bug, and this is where that shows up.
 */
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

/**
 * Desktop or mobile.
 *
 * One payload feeds both DoU clients, so "does this still read on a phone" is a
 * question the tool has to answer without the reader resizing their window. A
 * segmented control rather than a dropdown: two options, and the comparison is
 * the point — the alternative should be one click away, not behind a menu.
 */
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
