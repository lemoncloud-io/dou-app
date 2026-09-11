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
            className="flex w-20 shrink-0 flex-col items-center bg-rail px-2.5 pb-5 pt-[18px] text-rail-foreground"
        >
            {rail}
        </nav>
        {rail2 && (
            <nav
                aria-label="Places"
                className="flex w-20 shrink-0 flex-col items-center bg-rail-elevated px-2 pb-5 pt-6 text-rail-foreground"
            >
                {rail2}
            </nav>
        )}
        <aside className="z-10 flex w-60 shrink-0 flex-col overflow-hidden border-x border-hairline bg-sidebar text-sidebar-foreground lg:w-[286px]">
            {sidebar}
        </aside>
        <main className="flex flex-1 flex-col overflow-hidden">{main}</main>
        {panel}
        {overlay}
    </div>
);
