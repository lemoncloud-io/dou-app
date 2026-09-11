import { cn } from '@chatic/lib/utils';

import type { PanelWidth } from '../hooks/usePanelWidth';

interface PanelResizeHandleProps {
    /** Accessible name — says which panel the separator resizes. */
    label: string;
    panel: PanelWidth;
}

/**
 * The drag strip on a resizable panel's chat-facing edge (arrow keys when focused).
 * The panel must be `relative` (or otherwise positioned) and must not scroll itself —
 * an absolutely placed strip inside a scroll container scrolls away with the content.
 */
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
            'focus-ring absolute inset-y-0 z-10 w-1.5 cursor-col-resize transition-colors ease-tactile hover:bg-primary/40 active:bg-primary/60',
            panel.edge === 'left' ? 'left-0' : 'right-0'
        )}
    />
);
