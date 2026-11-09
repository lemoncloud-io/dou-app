/**
 * `components/report-logs/LogConsoleShell.tsx`
 * - The three-column frame: filters, the current view, and the detail column.
 *
 * The columns are laid out rather than stacked with overlays because tracking is a loop
 * between them — narrow, scan, read, narrow again — and an overlay makes every hop cost an
 * open and a close.
 *
 * Three columns need width. The detail column becomes an overlay below `xl`
 * (`ReportDetailPanel` owns that switch), and the rail leaves the row at the same breakpoint —
 * not at `md`. Keeping the rail later than the panel inverts the priority: in the 768–1279px
 * band the rail would keep its 256px while the overlay covered the list entirely, so the
 * least important column survives and the one that matters is hidden.
 *
 * Leaving the row is not disappearing, though: below `xl` a "Filters" button in the header
 * opens the same rail as a drawer from the left. It is one element whose classes change, not a
 * second copy — two copies would mount every field twice, with two drafts of the search text.
 * Like the detail column, the switch is CSS (`xl:`), so the first paint already has the right
 * shape at any width.
 *
 * The only state the shell holds is whether that drawer is open.
 */
import { useEffect, useState } from 'react';

import { SlidersHorizontal, X } from 'lucide-react';

import { useT } from '../../../i18n';

interface LogConsoleShellProps {
    /** Pins, monitor strip, banner and progress — everything that describes the whole screen. */
    header: React.ReactNode;
    rail: React.ReactNode;
    main: React.ReactNode;
    detail: React.ReactNode;
}

export const LogConsoleShell = ({ header, rail, main, detail }: LogConsoleShellProps) => {
    const { t } = useT('allLogs');
    const [railOpen, setRailOpen] = useState(false);

    // Escape closes the drawer, for the same reason it closes the detail overlay: the backdrop is
    // not focusable, so without it a keyboard user has no way out.
    useEffect(() => {
        if (!railOpen) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setRailOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [railOpen]);

    return (
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
            <div className="flex items-start gap-3 border-b border-border px-4 py-3">
                <button
                    type="button"
                    onClick={() => setRailOpen(true)}
                    aria-expanded={railOpen}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted xl:hidden"
                >
                    <SlidersHorizontal className="h-4 w-4" aria-hidden />
                    {t('shell.filters')}
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-2">{header}</div>
            </div>
            <div className="flex min-h-0 flex-1">
                {railOpen && (
                    <div
                        className="fixed inset-0 z-40 bg-black/40 xl:hidden"
                        onClick={() => setRailOpen(false)}
                        aria-hidden
                    />
                )}
                {/* A column at `xl`; below it, hidden until the button above opens it as a drawer. */}
                <div
                    className={
                        railOpen
                            ? 'fixed inset-y-0 left-0 z-50 flex shadow-xl xl:static xl:z-auto xl:min-h-0 xl:shadow-none'
                            : 'hidden xl:flex xl:min-h-0'
                    }
                >
                    {rail}
                    <button
                        type="button"
                        onClick={() => setRailOpen(false)}
                        aria-label={t('shell.closeFilters')}
                        className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground xl:hidden"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                {/* A <section>, not a <main>: `PrivateLayout` already renders the page's only
                    `main` landmark, and nesting a second one breaks landmark navigation. */}
                <section className="flex min-w-0 flex-1 flex-col overflow-auto">{main}</section>
                {detail}
            </div>
        </div>
    );
};
