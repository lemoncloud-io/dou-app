import type { ReactNode } from 'react';

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
 * provided. Colors come from theme tokens (--rail/--sidebar) so light/dark hold up.
 */
export const DesktopLayout = ({ rail, rail2, sidebar, main, panel, overlay }: DesktopLayoutProps) => (
    <div className="relative flex h-dvh bg-background">
        <nav
            aria-label="Cloud workspaces"
            className="flex w-[68px] shrink-0 flex-col items-center bg-rail py-3 pl-3 text-rail-foreground"
        >
            {rail}
        </nav>
        {rail2 && (
            <nav
                aria-label="Places"
                className="flex w-[64px] shrink-0 flex-col items-center border-l border-black/20 bg-gradient-to-b from-rail-elevated via-rail-elevated to-rail py-3 text-rail-foreground"
            >
                {rail2}
            </nav>
        )}
        <aside className="z-10 flex w-56 shrink-0 flex-col overflow-hidden border-r border-hairline bg-sidebar text-sidebar-foreground lg:w-64">
            {sidebar}
        </aside>
        <main className="flex flex-1 flex-col overflow-hidden">{main}</main>
        {panel}
        {overlay}
    </div>
);
