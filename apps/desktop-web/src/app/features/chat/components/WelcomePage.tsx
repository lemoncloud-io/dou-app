import { useTranslation } from 'react-i18next';

import { Check, ChevronRight, Hash, MessageCircle, Sparkles, User, UserPlus, type LucideIcon } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

import { PANE_HEADER, PANEL_TITLE } from '../../../shared';
import { welcomeProgress, type WelcomeSignals, type WelcomeStepKey } from '../utils';

const STEP_ICON: Record<WelcomeStepKey, LucideIcon> = {
    channel: Hash,
    invite: UserPlus,
    dm: MessageCircle,
    profile: User,
};

interface WelcomePageProps {
    placeName: string;
    signals: WelcomeSignals;
    /** Each step's way in; a step without one cannot be taken here and is drawn disabled. */
    onCreateChannel?: () => void;
    onInvite?: () => void;
    onStartDm?: () => void;
    onEditProfile?: () => void;
    /** Put the page away for this place. */
    onLater: () => void;
}

/**
 * The main pane of a place with nothing in it yet: a welcome, then four getting-started steps (create
 * a channel, invite members, send a DM, set up a profile) with the progress the place already shows.
 * A step opens the flow that does it; Later puts the page away.
 */
export const WelcomePage = ({
    placeName,
    signals,
    onCreateChannel,
    onInvite,
    onStartDm,
    onEditProfile,
    onLater,
}: WelcomePageProps) => {
    const { t } = useTranslation();
    const { steps, done } = welcomeProgress(signals);
    const actionOf: Record<WelcomeStepKey, (() => void) | undefined> = {
        channel: onCreateChannel,
        invite: onInvite,
        dm: onStartDm,
        profile: onEditProfile,
    };

    return (
        <section aria-label={t('nav.home')} className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
            <header className={`${PANE_HEADER} px-6`}>
                <span className={PANEL_TITLE}>{t('nav.home')}</span>
            </header>
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 pb-12 pt-[4.5rem]">
                <div className="mx-auto flex w-full max-w-[35rem] flex-col items-center">
                    <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/[0.16] text-foreground">
                        <Sparkles size={36} aria-hidden />
                    </span>
                    <h1 className="mt-7 text-center text-display text-foreground">
                        {t('placeWelcome.title', { place: placeName })}
                    </h1>
                    <p className="mt-3 whitespace-pre-line text-center text-callout text-muted-foreground">
                        {t('placeWelcome.subtitle')}
                    </p>
                    <div className="mt-11 flex w-full items-center gap-2.5">
                        <h2 className="flex-1 text-caption font-semibold text-foreground">{t('placeWelcome.steps')}</h2>
                        <span aria-hidden className="flex gap-1">
                            {steps.map((step, index) => (
                                <span
                                    key={step.key}
                                    className={cn('h-1 w-6 rounded-full', index < done ? 'bg-primary' : 'bg-well')}
                                />
                            ))}
                        </span>
                        <span className="text-micro tabular-nums text-muted-foreground">
                            {t('placeWelcome.progress', { done, total: steps.length })}
                        </span>
                    </div>
                    <ul className="mt-3 flex w-full flex-col gap-2">
                        {steps.map(step => {
                            const Icon = step.done ? Check : STEP_ICON[step.key];
                            const action = actionOf[step.key];
                            return (
                                <li key={step.key}>
                                    <button
                                        type="button"
                                        onClick={action}
                                        disabled={!action}
                                        className="focus-ring flex w-full items-center gap-3.5 rounded-xl border border-hairline bg-elevated px-4 py-3.5 text-left transition-colors ease-tactile hover:bg-accent/60 disabled:pointer-events-none"
                                    >
                                        <span
                                            className={cn(
                                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.625rem]',
                                                step.done ? 'bg-primary/[0.16] text-foreground' : 'bg-well text-foreground'
                                            )}
                                        >
                                            <Icon size={20} aria-hidden />
                                        </span>
                                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                            <span
                                                className={cn(
                                                    'truncate text-heading font-bold',
                                                    step.done ? 'text-muted-foreground line-through' : 'text-foreground'
                                                )}
                                            >
                                                {t(`placeWelcome.step.${step.key}.title`)}
                                            </span>
                                            <span className="truncate text-caption text-muted-foreground">
                                                {t(`placeWelcome.step.${step.key}.hint`)}
                                            </span>
                                        </span>
                                        {step.done && (
                                            <span className="shrink-0 text-micro font-medium text-muted-foreground">
                                                {t('placeWelcome.done')}
                                            </span>
                                        )}
                                        {/* No way in from here: the row stays readable, only the go-arrow is gone. */}
                                        {action && (
                                            <ChevronRight size={18} aria-hidden className="shrink-0 text-muted-foreground" />
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    <button
                        type="button"
                        onClick={onLater}
                        className="focus-ring mt-5 rounded-sm text-caption text-muted-foreground underline underline-offset-4 transition-colors ease-tactile hover:text-foreground"
                    >
                        {t('placeWelcome.later')}
                    </button>
                </div>
            </div>
        </section>
    );
};
