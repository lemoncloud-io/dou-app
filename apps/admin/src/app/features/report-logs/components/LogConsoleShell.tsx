import { useEffect, useState } from 'react';

import { SlidersHorizontal, X } from 'lucide-react';

import { useT } from '../../../i18n';

interface LogConsoleShellProps {
    header: React.ReactNode;
    rail: React.ReactNode;
    main: React.ReactNode;
    detail: React.ReactNode;
}

export const LogConsoleShell = ({ header, rail, main, detail }: LogConsoleShellProps) => {
    const { t } = useT('allLogs');
    const [railOpen, setRailOpen] = useState(false);

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
                <section className="flex min-w-0 flex-1 flex-col overflow-auto">{main}</section>
                {detail}
            </div>
        </div>
    );
};
