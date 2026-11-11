/**
 * `components/report-logs/console/PeriodPicker.tsx`
 * - The period as buttons, with the window it resolves to spelled out beneath them.
 *
 * Buttons rather than two date fields because the questions people bring are "just now", "today",
 * "yesterday", "this week" — and because a rolling window ("the last hour") cannot be typed into a
 * date field at all. The resolved window is printed in Korean time so nobody has to work out what
 * "the last 24 hours" meant at the moment the link was copied.
 */
import { useT } from '../../../../i18n';
import { PERIOD_PRESETS, type PeriodPreset, type ResolvedPeriod } from '../../lib/period';
import { formatDateTime } from '../../lib/timeFormat';
import { ChoiceRow } from './ui';

interface PeriodPickerProps {
    period: ResolvedPeriod;
    /** `custom` only: the days as written in the URL. */
    from?: string;
    to?: string;
    onChange: (preset: PeriodPreset, custom?: { from?: string; to?: string }) => void;
    /** Presets to offer; every one by default. */
    presets?: readonly PeriodPreset[];
}

const fieldClass =
    'rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring';

export const PeriodPicker = ({ period, from, to, onChange, presets = PERIOD_PRESETS }: PeriodPickerProps) => {
    const { t, lng } = useT('common');
    const active = period.preset;

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="w-10 shrink-0 text-[13px] font-medium text-muted-foreground">{t('period.label')}</span>
                <ChoiceRow
                    label={t('period.label')}
                    value={active}
                    options={[
                        ...presets.map(preset => ({ value: preset, label: t(`period.${preset}`) })),
                        // Not a button anyone presses: it shows what "logs at that time" set.
                        ...(active === 'around'
                            ? [
                                  {
                                      value: 'around' as const,
                                      label: t('period.around', {
                                          time: formatDateTime((period.fromMs + period.toMs) / 2, lng),
                                      }),
                                  },
                              ]
                            : []),
                    ]}
                    onChange={preset =>
                        preset !== 'around' &&
                        onChange(preset, preset === 'custom' ? { from: period.fromDate, to: period.toDate } : undefined)
                    }
                />
            </div>
            {active === 'custom' && (
                <div className="flex flex-wrap items-center gap-3 text-sm sm:pl-[3.25rem]">
                    <label className="flex items-center gap-2 text-muted-foreground">
                        {t('period.from')}
                        <input
                            type="date"
                            className={fieldClass}
                            value={from ?? period.fromDate}
                            max={to ?? period.toDate}
                            onChange={event =>
                                onChange('custom', { from: event.target.value, to: to ?? period.toDate })
                            }
                        />
                    </label>
                    <label className="flex items-center gap-2 text-muted-foreground">
                        {t('period.to')}
                        <input
                            type="date"
                            className={fieldClass}
                            value={to ?? period.toDate}
                            min={from ?? period.fromDate}
                            onChange={event =>
                                onChange('custom', { from: from ?? period.fromDate, to: event.target.value })
                            }
                        />
                    </label>
                </div>
            )}
            <p className="text-[13px] text-muted-foreground sm:pl-[3.25rem]">
                {t('period.range', { from: formatDateTime(period.fromMs, lng), to: formatDateTime(period.toMs, lng) })}
            </p>
        </div>
    );
};
