/**
 * `components/memberships/MembershipConsoleShell.tsx`
 * - The three-column frame: filters, the list, and the detail column.
 *
 * Same frame as the log console (`LogConsoleShell`), for the same reason: operating on a
 * membership is a loop between the three — narrow, scan, act, narrow again — and an overlay makes
 * every hop cost an open and a close.
 *
 * The detail column becomes an overlay below `xl` (`MembershipDetailPanel` owns that switch) and
 * the rail collapses at the same breakpoint. Collapsing the rail later would leave it holding its
 * width while the overlay covered the list entirely — the least important column surviving and the
 * one that matters hidden.
 *
 * The shell owns the frame only; it holds no state.
 */
interface MembershipConsoleShellProps {
    /** Counts, chips and the target server — everything that describes the whole screen. */
    header: React.ReactNode;
    rail: React.ReactNode;
    main: React.ReactNode;
    detail: React.ReactNode;
    footer: React.ReactNode;
}

export const MembershipConsoleShell = ({ header, rail, main, detail, footer }: MembershipConsoleShellProps) => (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3">{header}</div>
        <div className="flex min-h-0 flex-1">
            {/* Collapses with the detail column, so the list never loses room to it. */}
            <div className="hidden xl:flex xl:min-h-0">{rail}</div>
            {/* A <section>, not a <main>: `PrivateLayout` already renders the page's only `main`
                landmark, and nesting a second one breaks landmark navigation. */}
            <section className="flex min-w-0 flex-1 flex-col overflow-auto">{main}</section>
            {detail}
        </div>
        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            {footer}
        </div>
    </div>
);
