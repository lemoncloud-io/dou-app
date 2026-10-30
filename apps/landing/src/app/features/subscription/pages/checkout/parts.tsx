import { type JSX, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { storeUrls } from '../../../../config/links';
import { useDeviceDetect } from '../../../../hooks';
import { Banner, Button } from '../../components/ui';
import { toIsoDate } from '../../lib/calendar';
import { isPortError, useToday } from '../../lib/port';
import { cn, formatDate, formatMoney } from '../../utils';
import { dayBefore, formatShortDate } from './flow';

import type { CheckoutPreview } from '../../types';

/**
 * Pieces the checkout screens share and no other screen group draws. They stay in this folder rather
 * than `components/` until a second group needs one.
 */

const STEPS = ['plan', 'signIn', 'details', 'payment', 'done'] as const;

/**
 * The five-step strip above W-24, W-08, W-05 and W-06. Steps before `current` are ticked. From `md` it
 * is the row of dots and names; on a phone a five-segment bar with "3/5 · name" under it, so the five
 * fit and only the step the reader is on is named.
 */
export const CheckoutSteps = ({ current }: { current: 3 | 4 | 5 }): JSX.Element => {
    const { t } = useTranslation();
    const label = t('subscription.checkout.steps.label');
    return (
        <>
            <ol className="hidden items-center gap-2.5 whitespace-nowrap md:flex" aria-label={label}>
                {STEPS.map((step, index) => {
                    const number = index + 1;
                    // The last step is ticked, not numbered, once the reader is on it: it is the finish.
                    const done = number < current || (current === 5 && number === 5);
                    const active = number === current;
                    return (
                        <li key={step} className="flex items-center gap-2.5">
                            {index > 0 && <span aria-hidden className="h-px w-5 bg-line" />}
                            <span
                                aria-current={active ? 'step' : undefined}
                                className={cn(
                                    'flex items-center gap-1.5 text-[13px] tracking-[-0.005em]',
                                    done
                                        ? 'font-medium text-ink'
                                        : active
                                          ? 'font-semibold text-black'
                                          : 'font-medium text-[#999ca3]'
                                )}
                            >
                                <span
                                    aria-hidden
                                    className={cn(
                                        'flex size-6 items-center justify-center rounded-full text-xs font-bold',
                                        done || active ? 'bg-main-green text-navy' : 'border border-line text-[#999ca3]'
                                    )}
                                >
                                    {/* The design ticks the details step while it is open and numbers the payment step. */}
                                    {done || (active && number === 3) ? '✓' : number}
                                </span>
                                {t(`subscription.checkout.steps.${step}`)}
                            </span>
                        </li>
                    );
                })}
            </ol>
            <div className="w-full md:hidden" role="img" aria-label={label}>
                <div className="flex gap-1">
                    {STEPS.map((step, index) => (
                        <span
                            key={step}
                            className={cn('h-1 flex-1 rounded-full', index < current ? 'bg-main-green' : 'bg-line')}
                        />
                    ))}
                </div>
                <p className="mt-2 text-xs font-medium text-mute">
                    {t('subscription.checkout.steps.progress', {
                        current,
                        name: t(`subscription.checkout.steps.${STEPS[current - 1]}`),
                    })}
                </p>
            </div>
        </>
    );
};

/**
 * Where the checkout screens sit: from `lg` the form at 640px with the order summary beside it at the
 * top, below it one column with the summary between the heading and the form. The three are separate
 * slots so that order costs no second copy of anything.
 */
export const CheckoutLayout = ({
    head,
    summary,
    children,
}: {
    head: ReactNode;
    summary: ReactNode;
    children: ReactNode;
}): JSX.Element => (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-[minmax(0,1fr)_280px] lg:mx-auto lg:grid-cols-[640px_360px] lg:gap-x-16">
        <div className="flex flex-col gap-[22px] md:col-start-1 md:row-start-1">{head}</div>
        <div className="md:col-start-2 md:row-span-2 md:row-start-1 md:self-start">{summary}</div>
        <div className="flex flex-col gap-6 md:col-start-1 md:row-start-2">{children}</div>
    </div>
);

/** Label-and-value rows, as in the order summary and the detail boxes. */
export const FactRows = ({
    rows,
    className,
}: {
    rows: Array<{ label: ReactNode; value: ReactNode; key: string; strong?: boolean }>;
    className?: string;
}): JSX.Element => (
    <dl className={cn('flex flex-col gap-2', className)}>
        {rows.map(row => (
            <div key={row.key} className="flex items-center justify-between gap-4 text-sm tracking-[-0.01em]">
                <dt className="font-medium text-mute">{row.label}</dt>
                <dd className={cn('text-right text-ink', row.strong ? 'font-bold' : 'font-semibold')}>{row.value}</dd>
            </div>
        ))}
    </dl>
);

/** The grey order summary beside W-24, W-08 and W-05. */
export const OrderSummary = ({ children }: { children: ReactNode }): JSX.Element => {
    const { t } = useTranslation();
    return (
        <aside className="flex flex-col gap-3.5 self-start rounded-2xl bg-note px-5 py-4">
            <h2 className="text-base font-bold text-ink">{t('subscription.checkout.summary.title')}</h2>
            {children}
        </aside>
    );
};

/** The order summary beside W-24 and W-08: the plan, its allowance and price, the trial and when the first charge falls. */
export const CheckoutSummary = ({ preview }: { preview: CheckoutPreview }): JSX.Element => {
    const { t, i18n } = useTranslation();
    const today = toIsoDate(useToday());
    const { plan, withTrial, firstChargeAt, amountToday } = preview;
    const firstChargeIsToday = firstChargeAt === today;
    return (
        <OrderSummary>
            <FactRows
                rows={[
                    {
                        key: 'plan',
                        label: t('subscription.checkout.summary.plan'),
                        value: t('subscription.common.planName', { sort: plan.sort }),
                    },
                    {
                        key: 'clouds',
                        label: t('subscription.checkout.summary.clouds'),
                        value: t('subscription.checkout.summary.cloudCount', { count: plan.maxClouds }),
                    },
                    {
                        key: 'monthly',
                        label: t('subscription.checkout.summary.monthly'),
                        value: t('subscription.checkout.summary.monthlyValue', {
                            price: formatMoney(plan.monthly, i18n.language),
                        }),
                    },
                    {
                        key: 'trial',
                        label: t('subscription.checkout.summary.trial'),
                        value: withTrial
                            ? t('subscription.checkout.summary.trialRange', {
                                  from: formatShortDate(today),
                                  to: formatShortDate(dayBefore(firstChargeAt)),
                                  count: plan.trialDays,
                              })
                            : t('subscription.checkout.summary.trialUsed'),
                    },
                    {
                        key: 'firstCharge',
                        label: t('subscription.checkout.summary.firstCharge'),
                        value: firstChargeIsToday
                            ? t('subscription.checkout.summary.today', { date: formatDate(firstChargeAt) })
                            : formatDate(firstChargeAt),
                    },
                    {
                        key: 'today',
                        label: t('subscription.checkout.summary.chargeToday'),
                        value: formatMoney(amountToday, i18n.language),
                        strong: true,
                    },
                ]}
            />
        </OrderSummary>
    );
};

/** `checking` spins while a card is checked; `progress` is a charge under way. */
export type ResultTone = 'success' | 'checking' | 'progress' | 'danger' | 'neutral';

const ICON_TONES: Record<Exclude<ResultTone, 'checking'>, string> = {
    success: 'bg-main-green text-navy',
    progress: 'bg-navy text-white',
    danger: 'bg-[#fdeced] text-[#c1292e]',
    neutral: 'bg-note text-mute',
};

const ICONS: Record<Exclude<ResultTone, 'checking'>, string> = {
    success: '✓',
    progress: '···',
    danger: '!',
    neutral: '×',
};

/** The round mark, title and line that head every W-09 and W-06 scene. */
export const ResultHeader = ({
    tone,
    title,
    body,
    centered = true,
}: {
    tone: ResultTone;
    title: ReactNode;
    body?: ReactNode;
    centered?: boolean;
}): JSX.Element => (
    <header className={cn('flex flex-col gap-2', centered ? 'items-center text-center' : 'items-start')}>
        {tone === 'checking' ? (
            <span
                aria-hidden
                className="mb-3 size-12 animate-spin rounded-full border-[5px] border-line border-t-main-green"
            />
        ) : (
            <span
                aria-hidden
                className={cn(
                    'mb-3 flex size-14 items-center justify-center rounded-full text-2xl font-bold',
                    ICON_TONES[tone]
                )}
            >
                {ICONS[tone]}
            </span>
        )}
        <h1 className="text-xl font-bold leading-[1.4] text-ink md:text-2xl">{title}</h1>
        {body && <p className="text-sm font-medium leading-[1.6] text-mute md:text-[15px]">{body}</p>}
    </header>
);

/**
 * The column a payment status sits in: from `md` a bordered card centred under the bar, on a phone
 * the bare page. Everything inside is centred.
 */
export const ResultCard = ({
    children,
    busy,
    className,
}: {
    children: ReactNode;
    busy?: boolean;
    className?: string;
}): JSX.Element => (
    <section
        aria-busy={busy}
        className={cn(
            'mx-auto flex w-full max-w-[480px] flex-col gap-5 pt-6 md:rounded-2xl md:border md:border-line md:p-8 md:pt-8',
            className
        )}
    >
        {children}
    </section>
);

/** Two buttons at most: stacked full width on a phone, side by side and centred from `md`. */
export const ResultActions = ({ children }: { children: ReactNode }): JSX.Element => (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:justify-center">{children}</div>
);

/** The lime and the outlined pill a result offers, as links. */
export const primaryLink =
    'inline-flex h-[46px] items-center justify-center rounded-full bg-main-green px-7 text-[15px] font-bold text-navy hover:opacity-90 max-md:h-[54px]';
export const secondaryLink =
    'inline-flex h-[46px] items-center justify-center rounded-full border-[1.5px] border-[#d9dbe0] bg-white px-7 text-[15px] font-semibold text-ink hover:bg-muted max-md:h-[54px]';

/** A grey box with a bold heading, for the reason a payment failed or what to do next. */
export const NoteBox = ({
    title,
    children,
    className,
}: {
    title: ReactNode;
    children: ReactNode;
    className?: string;
}): JSX.Element => (
    <section className={cn('flex flex-col gap-2 rounded-2xl bg-note px-5 py-4 text-center', className)}>
        <h2 className="text-[13px] font-bold text-ink">{title}</h2>
        <div className="text-[13px] font-medium leading-[1.6] text-[#666b78]">{children}</div>
    </section>
);

/**
 * The way from a finished checkout to the app, where clouds are made. Desktop is where this page is
 * read, so it cannot open the app itself; it opens the store listing for the phone the reader most
 * likely has, as the desktop-only notice does.
 */
export const AppStoreLink = ({ children }: { children: ReactNode }): JSX.Element => {
    const device = useDeviceDetect();
    return (
        <a
            href={device === 'android' ? storeUrls.android : storeUrls.ios}
            target="_blank"
            rel="noopener noreferrer"
            className={primaryLink}
        >
            {children}
        </a>
    );
};

/** A screen that could not load what it draws: the reason, and a way to ask again. */
export const LoadError = ({ error, onRetry }: { error: unknown; onRetry?: () => void }): JSX.Element => {
    const { t } = useTranslation();
    return (
        <Banner
            tone="danger"
            title={t(
                isPortError(error, 'network')
                    ? 'subscription.common.error.network'
                    : 'subscription.common.error.unknown'
            )}
            action={
                onRetry && (
                    <Button size="sm" variant="secondary" onClick={() => onRetry()}>
                        {t('subscription.common.actions.retry')}
                    </Button>
                )
            }
        />
    );
};
