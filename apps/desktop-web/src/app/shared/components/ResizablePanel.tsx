import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { cn } from '@chatic/ui-kit';

import { useEscapeClose } from '../hooks/useEscapeClose';
import { usePanelWidth } from '../hooks/usePanelWidth';
import { focusComposerIfDropped } from '../utils/composerFocus';
import { PanelResizeHandle } from './PanelResizeHandle';

export const PANEL_DOCK_WIDTH = 1280;

export const PANEL_WIDTH = 360;

interface PanelShell {
    overlays: boolean;
    setClose: (close: (() => void) | null) => void;
}

export const PanelShellContext = createContext<PanelShell>({ overlays: false, setClose: () => undefined });

interface ResizablePanelProps {
    storageKey: string;
    resizeLabel: string;
    label?: string;
    className?: string;
    onClose?: () => void;
    children: ReactNode;
}

export const ResizablePanel = ({
    storageKey,
    resizeLabel,
    label,
    className,
    onClose,
    children,
}: ResizablePanelProps) => {
    const resize = usePanelWidth({ storageKey, defaultWidth: PANEL_WIDTH });
    useEscapeClose(onClose);
    const { overlays, setClose } = useContext(PanelShellContext);

    useEffect(() => {
        setClose(onClose ?? null);
        return () => setClose(null);
    }, [onClose, setClose]);

    const [opener] = useState(() =>
        typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)
    );
    useEffect(
        () => () => {
            const active = document.activeElement;
            if (active && active !== document.body && active !== opener && active.isConnected) return;
            if (opener?.isConnected) opener.focus();
            else focusComposerIfDropped();
        },
        [opener]
    );

    useEffect(() => {
        const panel = resize.panelRef.current;
        if (overlays && panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    }, [overlays, resize.panelRef]);

    return (
        <aside
            ref={resize.panelRef}
            tabIndex={-1}
            data-trailing-panel
            aria-label={label}
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
