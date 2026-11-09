/**
 * `tabs/StatsTab.tsx`
 * - The statistics tab: one period, five views of what the apps measure.
 *
 * - **Overview** — goals against their targets, and usage at a glance.
 * - **Performance by version and device** — one goal split by app version, OS or device, its daily
 *   trend, its distribution, and the slowest cases with the way to that user's timeline.
 * - **Usage patterns** — people and app opens per day and by hour, sessions per person, how long
 *   a session lasts, which screens are used, how sessions start.
 * - **Performance details** — room entry outcomes and cache use, server requests per endpoint,
 *   stalls per screen, the other web vitals.
 * - **Version adoption** — how users split across app versions, OS and devices, and how much of it
 *   can send statistics at all.
 *
 * The view is a URL parameter (`view`) like every other screen state.
 */
import { useT } from '../../../i18n';
import { PeriodPicker } from '../components/console/PeriodPicker';
import { ChoiceRow, Page, Panel } from '../components/console/ui';
import type { ConsoleNav } from '../hooks/use-console-nav';
import { PerfCompare } from '../stats/PerfCompare';
import { PerfDetails } from '../stats/PerfDetails';
import { StatsOverview } from '../stats/StatsOverview';
import { UsagePatterns } from '../stats/UsagePatterns';
import { VersionAdoption } from '../stats/VersionAdoption';

export const STATS_VIEWS = ['overview', 'perf', 'usage', 'detail', 'versions'] as const;

export type StatsView = (typeof STATS_VIEWS)[number];

interface StatsTabProps {
    nav: ConsoleNav;
}

export const StatsTab = ({ nav }: StatsTabProps) => {
    const { t } = useT('stats');
    const raw = nav.param('view');
    const view: StatsView = (STATS_VIEWS as readonly string[]).includes(raw) ? (raw as StatsView) : 'overview';

    const body = (() => {
        switch (view) {
            case 'perf':
                return <PerfCompare nav={nav} />;
            case 'usage':
                return <UsagePatterns nav={nav} />;
            case 'detail':
                return <PerfDetails nav={nav} />;
            case 'versions':
                return <VersionAdoption nav={nav} />;
            default:
                return <StatsOverview nav={nav} />;
        }
    })();

    return (
        <Page>
            <Panel className="flex flex-col gap-4 p-5">
                <PeriodPicker
                    period={nav.period}
                    from={nav.param('from') || undefined}
                    to={nav.param('to') || undefined}
                    onChange={nav.setPeriod}
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-4">
                    <span className="w-10 shrink-0 text-[13px] font-medium text-muted-foreground">
                        {t('views.label')}
                    </span>
                    <ChoiceRow
                        label={t('views.label')}
                        value={view}
                        options={STATS_VIEWS.map(value => ({ value, label: t(`views.${value}`) }))}
                        // Each view keeps its own choices; switching drops the previous view's.
                        onChange={next =>
                            nav.patch({ view: next === 'overview' ? '' : next, goal: '', by: '', dim: '' })
                        }
                    />
                </div>
            </Panel>
            {body}
        </Page>
    );
};
