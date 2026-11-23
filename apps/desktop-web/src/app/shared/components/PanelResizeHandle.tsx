import { cn } from '@chatic/ui-kit';

import type { PanelWidth } from '../hooks/usePanelWidth';

interface PanelResizeHandleProps {
    label: string;
    panel: PanelWidth;
}

export const PanelResizeHandle = ({ label, panel }: PanelResizeHandleProps) => (
    <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={panel.width}
        aria-valuemin={panel.minWidth}
        aria-valuemax={panel.maxWidth}
        tabIndex={0}
        onPointerDown={panel.startResize}
        onKeyDown={panel.resizeByKey}
        className={cn(
            'focus-ring absolute inset-y-0 z-raised w-1.5 cursor-col-resize transition-colors ease-tactile hover:bg-primary/40 active:bg-primary/60',
            panel.edge === 'left' ? 'left-0' : 'right-0'
        )}
    />
);
