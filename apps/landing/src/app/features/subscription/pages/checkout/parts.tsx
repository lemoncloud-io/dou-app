import { type JSX, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { storeUrls } from '../../../../config/links';
import { useDeviceDetect } from '../../../../hooks';
import { Banner, Button } from '../../components/ui';
import { isPortError } from '../../lib/port';
import { cn } from '../../utils';

/**
 * Pieces the checkout screens share and no other screen group draws. They stay in this folder rather
 * than `components/` until a second group needs one.
 */

const STEPS = ['plan', 'signIn', 'details', 'payment', 'done'] as const;

/** The five-step strip above W-08, W-05 and W-06. Steps before `current` are ticked. */
export const CheckoutSteps = ({ current }: { current: 3 | 4 | 5 }): JSX.Element => {
    const { t } = useTranslation();
    return (
        <ol className="flex items-center gap-2 whitespace-nowrap" aria-label={t('subscription.checkout.steps.label')}>
            {STEPS.map((step, index) => {
                const number = index + 1;
                // The last step is ticked, not numbered, once the reader is on it: it is the finish.
                const done = number < current || (current === 5 && number === 5);
                const active = number === current;
                return (
                    <li key={step} className="flex items-center gap-2">
                        {index > 0 && <span aria-hidden className="h-px w-4 bg-border" />}
                        <span
                            aria-current={active ? 'step' : undefined}
                            className={cn(
                                'flex items-center gap-2 text-[13px]',
                                done || active ? 'font-semibold text-navy' : 'text-subtitle'
                            )}
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold',
                                    done || active ? 'bg-main-green text-navy' : 'border border-border text-subtitle'
                                )}
                            >
                                {done ? '✓' : number}
                            </span>
                            {t(`subscription.checkout.steps.${step}`)}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
};

/** Label-and-value rows, as in the order summary and the detail boxes. */
export const FactRows = ({
    rows,
    className,
}: {
    rows: Array<{ label: ReactNode; value: ReactNode; key: string; strong?: boolean }>;
    className?: string;
}): JSX.Element => (
    <dl className={cn('flex flex-col gap-3', className)}>
        {rows.map(row => (
            <div key={row.key} className="flex items-baseline justify-between gap-4 text-sm">
                <dt className="text-subtitle">{row.label}</dt>
                <dd className={cn('text-right text-navy', row.strong && 'font-semibold')}>{row.value}</dd>
            </div>
        ))}
    </dl>
);

/** The grey order summary beside W-08 and W-05. */
export const OrderSummary = ({ children }: { children: ReactNode }): JSX.Element => {
    const { t } = useTranslation();
    return (
        <aside className="flex flex-col gap-4 self-start rounded-2xl bg-muted p-6">
            <h2 className="font-semibold text-navy">{t('subscription.checkout.summary.title')}</h2>
            {children}
        </aside>
    );
};

/** `checking` spins while a card is checked; `progress` is a charge under way. */
export type ResultTone = 'success' | 'checking' | 'progress' | 'danger' | 'neutral';

const ICON_TONES: Record<Exclude<ResultTone, 'checking'>, string> = {
    success: 'bg-main-green text-navy',
    progress: 'bg-navy text-white',
    danger: 'bg-status-danger text-white',
    neutral: 'bg-subtitle text-white',
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
    centered = false,
}: {
    tone: ResultTone;
    title: ReactNode;
    body?: ReactNode;
    centered?: boolean;
}): JSX.Element => (
    <header className={cn('flex flex-col gap-3', centered && 'items-center text-center')}>
        {tone === 'checking' ? (
            <span
                aria-hidden
                className="mb-3 h-16 w-16 animate-spin rounded-full border-[5px] border-muted border-t-main-green"
            />
        ) : (
            <span
                aria-hidden
                className={cn(
                    'mb-3 flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold',
                    ICON_TONES[tone]
                )}
            >
                {ICONS[tone]}
            </span>
        )}
        <h1 className="text-2xl font-bold text-navy">{title}</h1>
        {body && <p className="text-[15px] text-subtitle">{body}</p>}
    </header>
);

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
    <section className={cn('flex flex-col gap-2 rounded-2xl bg-muted px-5 py-4', className)}>
        <h2 className="text-sm font-semibold text-navy">{title}</h2>
        <div className="text-[13px] leading-relaxed text-desc-alt">{children}</div>
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
            className="inline-flex h-12 items-center justify-center rounded-full bg-main-green px-6 text-[15px] font-semibold text-navy hover:opacity-90"
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
