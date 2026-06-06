import type { ReactNode } from 'react';

interface DesktopLayoutProps {
    rail: ReactNode;
    sidebar: ReactNode;
    main: ReactNode;
    /** Optional right-side panel (channel settings); collapses when null. */
    panel?: ReactNode;
}

/**
 * Slack-style shell:
 *   [ place rail ] [ channel sidebar ] [ flexible main pane ] [ optional panel ]
 * The trailing panel is a collapsible 4th pane — rendered only when provided.
 * No safe-area insets (desktop) — degrades gracefully when no native bridge.
 */
export const DesktopLayout = ({ rail, sidebar, main, panel }: DesktopLayoutProps) => (
    <div className="flex h-screen bg-background">
        <nav className="flex w-[68px] shrink-0 flex-col items-center bg-zinc-900 py-3 text-zinc-300">{rail}</nav>
        <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-card">{sidebar}</aside>
        <main className="flex flex-1 flex-col overflow-hidden">{main}</main>
        {panel}
    </div>
);
