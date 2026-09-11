/**
 * `components/report-logs/LogConsoleShell.tsx`
 * - The three-column frame: filters, the current view, and the detail column.
 *
 * The columns are laid out rather than stacked with overlays because tracking is a loop
 * between them — narrow, scan, read, narrow again — and an overlay makes every hop cost an
 * open and a close (ADR-0083).
 *
 * Three columns need width. The detail column becomes an overlay below `xl`
 * (`ReportDetailPanel` owns that switch), and the rail collapses at the same breakpoint —
 * not at `md`. Hiding the rail later than the panel inverts the priority: in the 768–1279px
 * band the rail would keep its 256px while the overlay covered the list entirely, so the
 * least important column survives and the one that matters is hidden.
 *
 * The shell owns the frame only; it holds no state.
 */
interface LogConsoleShellProps {
    /** Pins, monitor strip, banner and progress — everything that describes the whole screen. */
    header: React.ReactNode;
    rail: React.ReactNode;
    main: React.ReactNode;
    detail: React.ReactNode;
}

export const LogConsoleShell = ({ header, rail, main, detail }: LogConsoleShellProps) => (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3">{header}</div>
        <div className="flex min-h-0 flex-1">
            {/* Collapses with the detail column, so the list never loses room to it. */}
            <div className="hidden xl:flex xl:min-h-0">{rail}</div>
            {/* A <section>, not a <main>: `PrivateLayout` already renders the page's only
                `main` landmark, and nesting a second one breaks landmark navigation. */}
            <section className="flex min-w-0 flex-1 flex-col overflow-auto">{main}</section>
            {detail}
        </div>
    </div>
);
