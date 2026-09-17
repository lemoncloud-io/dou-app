import { useEffect, useRef, type ReactNode } from 'react';

import { cn } from '@chatic/lib/utils';

import { useEscapeClose } from '../hooks/useEscapeClose';
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
    /**
     * Dismiss this panel. Supplying it buys the whole panel contract: Escape
     * closes (yielding to any dialog or menu open over it), and focus returns to
     * whatever opened the panel once it goes away. Panels that leave it out keep
     * neither, which is how the thread panel ended up with no keyboard exit.
     */
    onClose?: () => void;
    children: ReactNode;
}

/**
 * The trailing-panel shell (thread, saved, activity, profile, settings, debug): a
 * drag-resizable `aside` pinned right, overlaying the chat below `xl` and docking
 * beside it from `xl` up. It clips rather than scrolls so the resize handle stays put —
 * children own their own scroll region.
 */
export const ResizablePanel = ({
    storageKey,
    defaultWidth,
    resizeLabel,
    className,
    onClose,
    children,
}: ResizablePanelProps) => {
    const resize = usePanelWidth({ storageKey, defaultWidth });
    useEscapeClose(onClose);

    // The element that had focus when the panel mounted — usually the row button
    // that opened it. Restored on unmount so closing does not drop the caret at
    // the top of the document.
    const openerRef = useRef<HTMLElement | null>(null);
    useEffect(() => {
        openerRef.current = document.activeElement as HTMLElement | null;
        return () => {
            const opener = openerRef.current;
            if (opener?.isConnected) opener.focus();
        };
    }, []);

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
