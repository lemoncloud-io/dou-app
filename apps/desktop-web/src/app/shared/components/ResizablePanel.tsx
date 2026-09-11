import type { ReactNode } from 'react';

import { cn } from '@chatic/lib/utils';

import { usePanelWidth } from '../hooks/usePanelWidth';
import { PanelResizeHandle } from './PanelResizeHandle';

interface ResizablePanelProps {
    /** localStorage key the width persists under — one per panel kind. */
    storageKey: string;
    defaultWidth: number;
    /** Accessible name of the drag handle ("Resize thread panel"). */
    resizeLabel: string;
    /** Surface tone (`bg-background` / `bg-elevated`) — the shell supplies the rest. */
    className?: string;
    children: ReactNode;
}

/**
 * The trailing-panel shell (thread, saved, activity, profile, settings, debug): a
 * drag-resizable `aside` pinned right, overlaying the chat below `xl` and docking
 * beside it from `xl` up. It clips rather than scrolls so the resize handle stays put —
 * children own their own scroll region.
 */
export const ResizablePanel = ({ storageKey, defaultWidth, resizeLabel, className, children }: ResizablePanelProps) => {
    const resize = usePanelWidth({ storageKey, defaultWidth });
    return (
        <aside
            ref={resize.panelRef}
            style={{ width: resize.width }}
            className={cn(
                'absolute inset-y-0 right-0 z-30 flex max-w-[85vw] shrink-0 flex-col overflow-hidden border-l border-hairline shadow-raised xl:relative xl:z-auto xl:max-w-none xl:shadow-none',
                className
            )}
        >
            <PanelResizeHandle label={resizeLabel} panel={resize} />
            {children}
        </aside>
    );
};
