import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

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
/**
 * First tab stops on the page, visible only while focused. One conversation is
 * dozens of tab stops (every message is one), so without these the composer sat
 * behind all of them.
 */
const SkipLinks = ({ onSidebar }: { onSidebar: () => void }) => {
    const { t } = useTranslation();
    const focusIn = (selector: string) => document.querySelector<HTMLElement>(selector)?.focus();
    const links: { key: string; run: () => void }[] = [
        { key: 'shell.skip.composer', run: () => focusIn('main [data-composer-input]') },
        { key: 'shell.skip.messages', run: () => focusIn('main') },
        { key: 'shell.skip.sidebar', run: onSidebar },
    ];
    return (
        <div className="pointer-events-none absolute left-2 top-2 z-50 flex flex-col gap-1">
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
    // The drawer opens beside the rails, not over them: switching cloud or place
    // is exactly what someone reaching for the channel list may want next.
    const drawerLeft = rail2 ? 'left-[calc(theme(width.rail)*2)]' : 'left-[theme(width.rail)]';

    useEffect(() => {
        if (drawerOpen) sidebarWidth.panelRef.current?.focus();
    }, [drawerOpen, sidebarWidth.panelRef]);

    return (
        <ShellSidebarContext.Provider value={{ isDrawer, isOpen, open, close }}>
            <div className="relative flex h-full bg-background">
                <SkipLinks
                    onSidebar={() => {
                        if (isDrawer) open();
                        else sidebarWidth.panelRef.current?.querySelector<HTMLElement>('nav button')?.focus();
                    }}
                />
                <nav
                    aria-label={t('shell.clouds')}
                    className="flex w-rail shrink-0 flex-col items-center bg-rail px-1 pb-5 pt-[18px] text-rail-foreground"
                >
                    {rail}
                </nav>
                {rail2 && (
                    <nav
                        aria-label={t('shell.places')}
                        className="flex w-rail shrink-0 flex-col items-center bg-rail-elevated px-1 pb-5 pt-6 text-rail-foreground"
                    >
                        {rail2}
                    </nav>
                )}
                {drawerOpen && (
                    <div
                        aria-hidden
                        onClick={close}
                        className={`absolute inset-y-0 right-0 z-20 bg-overlay/40 animate-fade-in ${drawerLeft}`}
                    />
                )}
                {/* Unmounted while the drawer is shut, rather than hidden: the column's
                    own `flex` utility outranks the `hidden` attribute, so a hidden
                    drawer stayed on screen over the conversation and swallowed its
                    clicks. Nothing needs it mounted either — the channel list streams
                    from the cache and repaints instantly when it opens. */}
                {(!isDrawer || isOpen) && (
                    <aside
                        ref={sidebarWidth.panelRef}
                        // A drawer is a fixed-width overlay: the drag handle belongs to the
                        // docked column, where there is a neighbour to trade width with.
                        style={isDrawer ? undefined : { width: sidebarWidth.width }}
                        tabIndex={drawerOpen ? -1 : undefined}
                        role={drawerOpen ? 'dialog' : undefined}
                        aria-label={drawerOpen ? t('sidebar.channels') : undefined}
                        className={
                            isDrawer
                                ? `absolute inset-y-0 ${drawerLeft} z-30 flex w-[286px] max-w-[85%] flex-col overflow-hidden border-r border-hairline bg-sidebar text-sidebar-foreground shadow-raised animate-fade-in`
                                : 'relative z-10 flex shrink-0 flex-col overflow-hidden border-x border-hairline bg-sidebar text-sidebar-foreground'
                        }
                    >
                        {drawerOpen && (
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
                        )}
                        {sidebar}
                        {!isDrawer && <PanelResizeHandle label={t('sidebar.resize')} panel={sidebarWidth} />}
                    </aside>
                )}
                {/* A floor on the conversation itself, not only on each panel: the
                sidebar and a docked trailing panel clamp independently, so only a
                min-width here keeps the message column from being squeezed out
                between them at a narrow desktop window. The floor is dropped once
                the sidebar is a drawer, because then it is the only thing left
                that could force the page to scroll sideways. It is inert under an
                open drawer, so Tab stays between the rails and the list. */}
                <main
                    inert={drawerOpen || undefined}
                    tabIndex={-1}
                    style={isDrawer ? undefined : { minWidth: MIN_CHAT_WIDTH }}
                    className="flex min-w-0 flex-1 flex-col overflow-hidden outline-none"
                >
                    {main}
                </main>
                {panel}
                {overlay}
            </div>
        </ShellSidebarContext.Provider>
    );
};
