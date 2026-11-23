import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { cn } from '@chatic/ui-kit';

import {
    COMPACT_SHELL_WIDTH,
    MIN_CHAT_WIDTH,
    PANEL_DOCK_WIDTH,
    PanelResizeHandle,
    PanelShellContext,
    useEscapeClose,
    usePanelWidth,
    useSelectedChannelStore,
    useViewportNarrow,
} from '../../../shared';
import { UnsendableFilesHost, VoiceDetailHost } from './images';

interface DesktopLayoutProps {
    rail: ReactNode;
    nav?: ReactNode;
    sidebar: ReactNode;
    sidebarWidth?: { storageKey: string; defaultWidth: number };
    main: ReactNode;
    panel?: ReactNode;
    overlay?: ReactNode;
}

interface ShellSidebarState {
    isDrawer: boolean;
    isOpen: boolean;
    open: () => void;
    close: () => void;
}

const noop = () => undefined;

const ShellSidebarContext = createContext<ShellSidebarState>({
    isDrawer: false,
    isOpen: false,
    open: noop,
    close: noop,
});

export const useShellSidebar = () => useContext(ShellSidebarContext);

const SkipLinks = ({ onSidebar }: { onSidebar: () => void }) => {
    const { t } = useTranslation();
    const focusIn = (selector: string) => document.querySelector<HTMLElement>(selector)?.focus();
    const links: { key: string; run: () => void }[] = [
        { key: 'shell.skip.composer', run: () => focusIn('main [data-composer-input]') },
        { key: 'shell.skip.messages', run: () => focusIn('main') },
        { key: 'shell.skip.sidebar', run: onSidebar },
    ];
    return (
        <div className="pointer-events-none absolute left-2 top-2 z-popover flex flex-col gap-1">
            {links.map(link => (
                <button
                    key={link.key}
                    type="button"
                    onClick={link.run}
                    className="focus-ring pointer-events-auto sr-only rounded-md bg-elevated px-3 py-2 text-callout font-medium text-foreground shadow-raised focus:not-sr-only"
                >
                    {t(link.key)}
                </button>
            ))}
        </div>
    );
};

const HOME_SIDEBAR_WIDTH = { storageKey: 'chatic.sidebar.width', defaultWidth: 286 };

const firstSidebarTarget = (sidebar: HTMLElement | null): HTMLElement | undefined => {
    const shown = (selector: string) =>
        Array.from(sidebar?.querySelectorAll<HTMLElement>(selector) ?? []).find(el => !el.closest('[hidden]'));
    return shown('nav button') ?? shown('button');
};

export const DesktopLayout = ({
    rail,
    nav,
    sidebar,
    sidebarWidth: sidebarSize = HOME_SIDEBAR_WIDTH,
    main,
    panel,
    overlay,
}: DesktopLayoutProps) => {
    const { t } = useTranslation();
    const isDrawer = useViewportNarrow();
    const isCompact = useViewportNarrow(COMPACT_SHELL_WIDTH);
    const [isOpen, setIsOpen] = useState(false);
    const sidebarWidth = usePanelWidth({
        ...sidebarSize,
        edge: 'right',
        minWidth: 200,
        maxWidth: 480,
    });

    const selectedChannelId = useSelectedChannelStore(s => s.selectedChannelId);

    const panelOverlays = useViewportNarrow(PANEL_DOCK_WIDTH) && !!panel;
    const panelCloseRef = useRef<(() => void) | null>(null);
    const panelShell = useMemo(
        () => ({
            overlays: panelOverlays,
            setClose: (close: (() => void) | null) => {
                panelCloseRef.current = close;
            },
        }),
        [panelOverlays]
    );

    const openerRef = useRef<HTMLElement | null>(null);
    const returnFocusRef = useRef(false);
    const close = useCallback(() => {
        returnFocusRef.current = true;
        setIsOpen(false);
    }, []);
    useEffect(() => {
        if (isOpen || !returnFocusRef.current) return;
        returnFocusRef.current = false;
        openerRef.current?.focus();
        openerRef.current = null;
    }, [isOpen]);
    const open = useCallback(() => {
        openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setIsOpen(true);
    }, []);
    useEffect(() => {
        if (!isDrawer) setIsOpen(false);
    }, [isDrawer]);
    useEffect(() => {
        setIsOpen(false);
    }, [selectedChannelId]);
    useEscapeClose(isDrawer && isOpen ? close : undefined);

    const drawerOpen = isDrawer && isOpen;
    const drawerLeft = nav ? 'left-[calc(theme(width.rail)*2)]' : 'left-[theme(width.rail)]';

    useEffect(() => {
        if (drawerOpen) sidebarWidth.panelRef.current?.focus();
    }, [drawerOpen, sidebarWidth.panelRef]);

    const rails = (
        <>
            <nav
                aria-label={t('shell.rail')}
                data-shell-rail="cloud"
                className="flex w-rail shrink-0 flex-col items-center bg-rail px-1 pb-5 pt-6 text-rail-foreground"
            >
                {rail}
            </nav>
            {nav && (
                <nav
                    aria-label={t('shell.nav')}
                    data-shell-rail="nav"
                    className="flex w-rail shrink-0 flex-col items-center bg-rail-elevated px-1 pb-5 pt-6 text-rail-foreground"
                >
                    {nav}
                </nav>
            )}
        </>
    );
    const closeButton = (
        <div className="flex shrink-0 justify-end px-2 pt-2">
            <button
                type="button"
                aria-label={t('sidebar.hide')}
                onClick={close}
                className="focus-ring tactile hit-target flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
                <X size={18} aria-hidden />
            </button>
        </div>
    );

    return (
        <ShellSidebarContext.Provider value={{ isDrawer, isOpen, open, close }}>
            <PanelShellContext.Provider value={panelShell}>
                <div className="relative flex h-full bg-background">
                    {!drawerOpen && (
                        <SkipLinks
                            onSidebar={() => {
                                if (isDrawer) open();
                                else firstSidebarTarget(sidebarWidth.panelRef.current)?.focus();
                            }}
                        />
                    )}
                    <VoiceDetailHost />
                    <UnsendableFilesHost />
                    {isCompact ? (
                        <div
                            role="dialog"
                            aria-modal
                            aria-label={t('sidebar.channels')}
                            className={cn('absolute inset-0 z-drawer animate-fade-in', isOpen ? 'flex' : 'hidden')}
                        >
                            {rails}
                            <aside
                                ref={sidebarWidth.panelRef}
                                tabIndex={-1}
                                data-shell-sidebar
                                className="flex min-w-0 flex-1 flex-col overflow-hidden bg-sidebar text-sidebar-foreground outline-none"
                            >
                                {closeButton}
                                {sidebar}
                            </aside>
                        </div>
                    ) : (
                        <>
                            {rails}
                            {drawerOpen && (
                                <div
                                    aria-hidden
                                    onClick={close}
                                    className={`absolute inset-y-0 right-0 z-float bg-overlay/40 animate-fade-in ${drawerLeft}`}
                                />
                            )}
                            {(!isDrawer || isOpen) && (
                                <aside
                                    ref={sidebarWidth.panelRef}
                                    data-shell-sidebar
                                    style={isDrawer ? undefined : { width: sidebarWidth.width }}
                                    tabIndex={drawerOpen ? -1 : undefined}
                                    role={drawerOpen ? 'dialog' : undefined}
                                    aria-modal={drawerOpen || undefined}
                                    aria-label={drawerOpen ? t('sidebar.channels') : undefined}
                                    className={
                                        isDrawer
                                            ? `absolute inset-y-0 ${drawerLeft} z-drawer flex w-[286px] max-w-[85%] flex-col overflow-hidden border-r border-hairline bg-sidebar text-sidebar-foreground shadow-raised animate-fade-in`
                                            : 'relative z-raised flex shrink-0 flex-col overflow-hidden border-x border-hairline bg-sidebar text-sidebar-foreground'
                                    }
                                >
                                    {drawerOpen && closeButton}
                                    {sidebar}
                                    {!isDrawer && (
                                        <PanelResizeHandle label={t('sidebar.resize')} panel={sidebarWidth} />
                                    )}
                                </aside>
                            )}
                        </>
                    )}
                    <div className="relative flex min-w-0 flex-1">
                        <main
                            inert={drawerOpen || panelOverlays || undefined}
                            tabIndex={-1}
                            style={isDrawer ? undefined : { minWidth: MIN_CHAT_WIDTH }}
                            className="flex min-w-0 flex-1 flex-col overflow-hidden outline-none"
                        >
                            {main}
                        </main>
                        {panelOverlays && (
                            <div
                                aria-hidden
                                onClick={() => panelCloseRef.current?.()}
                                className="absolute inset-0 z-float bg-overlay/40 animate-fade-in"
                            />
                        )}
                    </div>
                    {panel}
                    {overlay}
                </div>
            </PanelShellContext.Provider>
        </ShellSidebarContext.Provider>
    );
};
