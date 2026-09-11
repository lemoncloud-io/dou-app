import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { PanelResizeHandle, usePanelWidth } from '../../../shared';

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

/**
 * Slack-style shell:
 *   [ cloud rail ] [ place rail ] [ channel sidebar ] [ flexible main pane ] [ optional panel ]
 * The place rail and trailing panel are collapsible — each rendered only when
 * provided. The channel sidebar drags from its right edge, like the trailing
 * panels drag from their left. Colors come from theme tokens (--rail/--sidebar)
 * so light/dark hold up.
 */
export const DesktopLayout = ({ rail, rail2, sidebar, main, panel, overlay }: DesktopLayoutProps) => {
    const { t } = useTranslation();
    const sidebarWidth = usePanelWidth({
        storageKey: 'chatic.sidebar.width',
        defaultWidth: 286,
        edge: 'right',
        minWidth: 200,
        maxWidth: 480,
    });

    return (
        <div className="relative flex h-dvh bg-background">
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
            <aside
                ref={sidebarWidth.panelRef}
                style={{ width: sidebarWidth.width }}
                className="relative z-10 flex shrink-0 flex-col overflow-hidden border-x border-hairline bg-sidebar text-sidebar-foreground"
            >
                {sidebar}
                <PanelResizeHandle label={t('sidebar.resize')} panel={sidebarWidth} />
            </aside>
            <main className="flex flex-1 flex-col overflow-hidden">{main}</main>
            {panel}
            {overlay}
        </div>
    );
};
