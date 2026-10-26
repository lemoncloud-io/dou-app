/**
 * `components/report-logs/console/ConsoleHeader.tsx`
 * - The page's own header: its name, which server it reads, the five tabs, and a link to share.
 *
 * The server switch lives here, not in a filter column, because it changes what every number on
 * every tab means — reading prod while believing it is dev (or the reverse) is the mistake this
 * header exists to make impossible. It never collapses, at any width.
 */
import { useEffect, useState } from 'react';

import { Link2 } from 'lucide-react';

import { useT } from '../../../../i18n';
import type { ReportStage } from '../../api/reportLogApi';
import { CONSOLE_TABS, type ConsoleTab } from '../../hooks/use-console-nav';

interface ConsoleHeaderProps {
    tab: ConsoleTab;
    onTab: (tab: ConsoleTab) => void;
    stage: ReportStage;
    onStage: (stage: ReportStage) => void;
}

const STAGES: ReportStage[] = ['v1', 'd1'];

export const ConsoleHeader = ({ tab, onTab, stage, onStage }: ConsoleHeaderProps) => {
    const { t } = useT('common');
    const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(null), 2_000);
        return () => clearTimeout(timer);
    }, [copied]);

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied('ok');
        } catch {
            setCopied('failed');
        }
    };

    return (
        <header className="flex flex-col gap-2 border-b border-border bg-background px-4 pt-4 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl font-semibold text-foreground">{t('console.title')}</h1>
                <div className="flex flex-wrap items-center gap-2">
                    <div
                        role="radiogroup"
                        aria-label={t('stage.label')}
                        className="flex items-center gap-0.5 rounded-lg border border-border p-0.5 text-sm"
                    >
                        <span className="px-2 text-xs text-muted-foreground">{t('stage.label')}</span>
                        {STAGES.map(value => (
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={stage === value}
                                title={t(`stage.${value}Hint`)}
                                onClick={() => onStage(value)}
                                className={`rounded-md px-3 py-1 font-medium ${
                                    stage === value
                                        ? value === 'v1'
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-amber-500 text-black'
                                        : 'text-muted-foreground hover:bg-muted'
                                }`}
                            >
                                {t(`stage.${value}`)}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => void copyLink()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                        <Link2 className="h-4 w-4" aria-hidden />
                        {copied === 'ok'
                            ? t('console.copied')
                            : copied === 'failed'
                              ? t('console.copyFailed')
                              : t('console.copyLink')}
                    </button>
                </div>
            </div>
            {/* Navigation between views rather than an ARIA tab widget: each tab is its own URL, so
                buttons marked with `aria-current` say exactly what they are. */}
            <nav aria-label={t('console.tabsLabel')} className="-mb-px flex gap-1 overflow-x-auto">
                {CONSOLE_TABS.map(value => (
                    <button
                        key={value}
                        type="button"
                        aria-current={tab === value ? 'page' : undefined}
                        onClick={() => onTab(value)}
                        className={`whitespace-nowrap border-b-2 px-4 py-3 text-[15px] font-medium transition-colors ${
                            tab === value
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {t(`tabs.${value}`)}
                    </button>
                ))}
            </nav>
        </header>
    );
};
