/**
 * `components/report-logs/console/ui.tsx`
 * - The few layout pieces every purpose tab is built from, so the tabs read as one product.
 *
 * The rules they carry: content no wider than a comfortable reading line, one card surface for a
 * group of related facts, a heading per section with a one-line explanation under it, numbers with
 * their label above them, and colour only where it means something — red for errors, blue for
 * reports. Everything is drawn from the theme tokens (or a colour paired with its `dark:` twin), so
 * the tabs read the same in light and dark.
 */
import type { ReactNode } from 'react';

/** The scrolling page body, centred and capped so lines stay readable on a wide screen. */
export const Page = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
    <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8">{children}</div>
        </div>
        {aside}
    </div>
);

/** One surface for related facts. */
export const Panel = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
    <section className={`rounded-2xl border border-border bg-card ${className}`}>{children}</section>
);

export const SectionTitle = ({ title, hint, action }: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) => (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {hint && <p className="text-[13px] leading-relaxed text-muted-foreground">{hint}</p>}
        </div>
        {action}
    </div>
);

export type MetricTone = 'error' | 'report' | 'good' | 'plain';

const METRIC_TONE: Record<MetricTone, string> = {
    error: 'text-red-600 dark:text-red-400',
    report: 'text-blue-600 dark:text-blue-400',
    good: 'text-emerald-600 dark:text-emerald-400',
    plain: 'text-foreground',
};

/** A number with its label above it, the way a card is scanned: what, then how many. */
export const Metric = ({
    label,
    value,
    tone = 'plain',
    sub,
    size = 'md',
}: {
    label: ReactNode;
    value: ReactNode;
    tone?: MetricTone;
    sub?: ReactNode;
    size?: 'md' | 'lg';
}) => (
    <div className="flex min-w-[6.5rem] flex-col gap-1">
        <span className="text-[13px] text-muted-foreground">{label}</span>
        <span className={`${size === 'lg' ? 'text-3xl' : 'text-2xl'} font-semibold tabular-nums ${METRIC_TONE[tone]}`}>
            {value}
        </span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
);

export type PillTone = 'error' | 'report' | 'good' | 'warn' | 'neutral';

const PILL_TONE: Record<PillTone, string> = {
    error: 'bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300',
    report: 'bg-blue-500/10 text-blue-700 ring-blue-500/20 dark:text-blue-300',
    good: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300',
    warn: 'bg-amber-500/10 text-amber-800 ring-amber-500/20 dark:text-amber-300',
    neutral: 'bg-muted text-muted-foreground ring-border',
};

export const Pill = ({
    tone = 'neutral',
    children,
    title,
}: {
    tone?: PillTone;
    children: ReactNode;
    title?: string;
}) => (
    <span
        title={title}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${PILL_TONE[tone]}`}
    >
        {children}
    </span>
);

/** A row of choices where exactly one is on — the period, the cloud. */
export const ChoiceRow = <T extends string>({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: Array<{ value: T; label: string; title?: string }>;
    value: T;
    onChange: (value: T) => void;
}) => (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
        {options.map(option => (
            <button
                key={option.value}
                type="button"
                aria-pressed={value === option.value}
                title={option.title}
                onClick={() => onChange(option.value)}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                    value === option.value
                        ? 'border-primary bg-primary font-medium text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:bg-muted'
                }`}
            >
                {option.label}
            </button>
        ))}
    </div>
);

/** Secondary buttons inside lists and cards. */
export const quietButton =
    'inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-muted';

/** The main action of a screen. */
export const primaryButton =
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
