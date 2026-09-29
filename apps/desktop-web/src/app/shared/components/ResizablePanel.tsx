import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { cn } from '@chatic/lib/utils';

import { useEscapeClose } from '../hooks/useEscapeClose';
import { usePanelWidth } from '../hooks/usePanelWidth';
import { PanelResizeHandle } from './PanelResizeHandle';

/** Below this window width a trailing panel lays over the chat instead of docking (Tailwind `xl`). */
export const PANEL_DOCK_WIDTH = 1280;

/** Every trailing panel opens at this width; each one's own drag is remembered separately. */
export const PANEL_WIDTH = 360;

interface PanelShell {
    /** The window is too narrow to dock a panel, so it covers the chat. */
    overlays: boolean;
    /** The open panel hands the shell its close, for the scrim beside it. */
    setClose: (close: (() => void) | null) => void;
}

/** Provided by the desktop shell, which owns the chat pane a covering panel sits over. */
export const PanelShellContext = createContext<PanelShell>({ overlays: false, setClose: () => undefined });

interface ResizablePanelProps {
    /** localStorage key the width persists under — one per panel kind. */
    storageKey: string;
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
 *
 * Overlaying, it behaves as the modal layer it looks like: the shell dims and disables
 * the chat behind it (a click there closes the panel), and focus moves into the panel.
 * The covered chat used to stay live under it, in the tab order and clickable, with
 * about 218px of it left showing at 1024px.
 */
export const ResizablePanel = ({ storageKey, resizeLabel, className, onClose, children }: ResizablePanelProps) => {
    const resize = usePanelWidth({ storageKey, defaultWidth: PANEL_WIDTH });
    useEscapeClose(onClose);
    const { overlays, setClose } = useContext(PanelShellContext);

    useEffect(() => {
        setClose(onClose ?? null);
        return () => setClose(null);
    }, [onClose, setClose]);

    // The element that had focus when the panel opened, usually the control that
    // opened it, restored on unmount so closing does not drop focus on <body>. Read
    // during the first render: every effect below and in the panel's content (the
    // thread's reply box, the settings member list) may move focus first, and an
    // effect-time read recorded the panel itself, which is gone by the time it closes.
    const [opener] = useState(() =>
        typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)
    );
    useEffect(
        () => () => {
            if (opener?.isConnected) opener.focus();
        },
        [opener]
    );

    // A panel whose own content already took focus (the thread's reply box) keeps it.
    useEffect(() => {
        const panel = resize.panelRef.current;
        if (overlays && panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    }, [overlays, resize.panelRef]);

    return (
        <aside
            ref={resize.panelRef}
            tabIndex={-1}
            style={{ width: resize.width }}
            className={cn(
                'absolute inset-y-0 right-0 z-drawer outline-none flex max-w-[85vw] shrink-0 flex-col overflow-hidden border-l border-hairline shadow-raised xl:relative xl:z-auto xl:max-w-none xl:shadow-none',
                className
            )}
        >
            <PanelResizeHandle label={resizeLabel} panel={resize} />
            {children}
        </aside>
    );
};
