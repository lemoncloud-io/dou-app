import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
    MIN_CHAT_WIDTH,
    PanelResizeHandle,
    useEscapeClose,
    usePanelWidth,
    useSelectedChannelStore,
    useViewportNarrow,
} from '../../../shared';

interface DesktopLayoutProps {
    rail: ReactNode;
    /** Optional second rail (places) between the cloud rail and the sidebar. */
    rail2?: ReactNode;
    sidebar: ReactNode;
    main: ReactNode;
    /** Optional right-side panel (channel settings); collapses when null. */
    panel?: ReactNode;
    /** Optional overlay (cloud/place switch loader) — positioned over sidebar+main. */
    overlay?: ReactNode;
}

interface ShellSidebarState {
    /** The sidebar is a drawer, not a column: the window is too narrow to dock it. */
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

/**
 * Lets the chat header show a sidebar toggle exactly when the sidebar is a
 * drawer. The header lives inside `main`, so it cannot read the layout's width
 * decision any other way, and a toggle that is always visible would add a
 * control to the docked layout that has nothing to do.
 */
export const useShellSidebar = () => useContext(ShellSidebarContext);

/**
 * Slack-style shell:
 *   [ cloud rail ] [ place rail ] [ channel sidebar ] [ flexible main pane ] [ optional panel ]
 * The place rail and trailing panel are collapsible — each rendered only when
 * provided. The channel sidebar drags from its right edge, like the trailing
 * panels drag from their left. Colors come from theme tokens (--rail/--sidebar)
 * so light/dark hold up.
 *
 * Below `NARROW_SHELL_WIDTH` the sidebar stops being a column and becomes a
 * drawer over the message column, toggled from the chat header. Three fixed
 * columns plus the chat floor need 756px, so holding them at a narrow window (or
 * at 200% browser zoom, which reports as one) pushed the header actions and half
 * the message column off-screen behind a horizontal scrollbar.
 */
export const DesktopLayout = ({ rail, rail2, sidebar, main, panel, overlay }: DesktopLayoutProps) => {
    const { t } = useTranslation();
    const isDrawer = useViewportNarrow();
    const [isOpen, setIsOpen] = useState(false);
    const sidebarWidth = usePanelWidth({
        storageKey: 'chatic.sidebar.width',
        defaultWidth: 286,
        edge: 'right',
        minWidth: 200,
        maxWidth: 480,
    });

    const selectedChannelId = useSelectedChannelStore(s => s.selectedChannelId);

    // The drawer covers the conversation, so keyboard focus has to travel with it
    // and come back to the control that opened it.
    const openerRef = useRef<HTMLElement | null>(null);
    const close = useCallback(() => {
        setIsOpen(false);
        openerRef.current?.focus();
        openerRef.current = null;
    }, []);
    const open = useCallback(() => {
        openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setIsOpen(true);
    }, []);
    // Widening the window docks the sidebar again; leaving `isOpen` set would
    // reopen the drawer the next time it narrows.
    useEffect(() => {
        if (!isDrawer) setIsOpen(false);
    }, [isDrawer]);
    // Picking a channel is the drawer's whole purpose; it gets out of the way
    // afterwards instead of covering the conversation it just opened.
    useEffect(() => {
        setIsOpen(false);
    }, [selectedChannelId]);
    useEscapeClose(isDrawer && isOpen ? close : undefined);

    const drawerOpen = isDrawer && isOpen;

    useEffect(() => {
        if (drawerOpen) sidebarWidth.panelRef.current?.focus();
    }, [drawerOpen, sidebarWidth.panelRef]);

    return (
        <ShellSidebarContext.Provider value={{ isDrawer, isOpen, open, close }}>
            <div className="relative flex h-full bg-background">
                <nav
                    aria-label="Cloud workspaces"
                    className="flex w-rail shrink-0 flex-col items-center bg-rail px-1 pb-5 pt-[18px] text-rail-foreground"
                >
                    {rail}
                </nav>
                {rail2 && (
                    <nav
                        aria-label="Places"
                        className="flex w-rail shrink-0 flex-col items-center bg-rail-elevated px-1 pb-5 pt-6 text-rail-foreground"
                    >
                        {rail2}
                    </nav>
                )}
                {drawerOpen && (
                    <div aria-hidden onClick={close} className="absolute inset-0 z-20 bg-overlay/40 animate-fade-in" />
                )}
                <aside
                    ref={sidebarWidth.panelRef}
                    // A drawer is a fixed-width overlay: the drag handle belongs to the
                    // docked column, where there is a neighbour to trade width with.
                    style={isDrawer ? undefined : { width: sidebarWidth.width }}
                    hidden={isDrawer && !isOpen}
                    tabIndex={drawerOpen ? -1 : undefined}
                    className={
                        isDrawer
                            ? 'absolute inset-y-0 left-0 z-30 flex w-[286px] max-w-[85%] flex-col overflow-hidden border-r border-hairline bg-sidebar text-sidebar-foreground shadow-raised'
                            : 'relative z-10 flex shrink-0 flex-col overflow-hidden border-x border-hairline bg-sidebar text-sidebar-foreground'
                    }
                >
                    {sidebar}
                    {!isDrawer && <PanelResizeHandle label={t('sidebar.resize')} panel={sidebarWidth} />}
                </aside>
                {/* A floor on the conversation itself, not only on each panel: the
                sidebar and a docked trailing panel clamp independently, so only a
                min-width here keeps the message column from being squeezed out
                between them at a narrow desktop window. The floor is dropped once
                the sidebar is a drawer, because then it is the only thing left
                that could force the page to scroll sideways. */}
                <main
                    style={isDrawer ? undefined : { minWidth: MIN_CHAT_WIDTH }}
                    className="flex min-w-0 flex-1 flex-col overflow-hidden"
                >
                    {main}
                </main>
                {panel}
                {overlay}
            </div>
        </ShellSidebarContext.Provider>
    );
};
