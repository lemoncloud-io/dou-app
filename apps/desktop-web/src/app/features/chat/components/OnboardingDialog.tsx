import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCircle, Check } from 'lucide-react';

import { runtime } from '@chatic/app-runtime';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { focusComposerIfDropped } from '../../../shared';
import { hasSeenOnboarding, markOnboardingSeen, useOnboardingStore } from '../stores';

interface OnboardingDialogProps {
    /** First-run trigger; false suppresses it (the dialog can still be reopened). */
    enabled: boolean;
    /**
     * Default Cloud only: that cloud provisions a Self Channel on first access,
     * and it is slow enough to need saying. Everywhere else there is nothing to
     * wait for, so the row is not rendered at all — it used to spin forever on a
     * real workspace, which is where a reopen from Settings lands.
     */
    showChannelStatus: boolean;
    /** The Self Channel itself is in the list — flips the row to ready. */
    isChannelReady: boolean;
}

/**
 * How long the Self Channel row waits before it says the channel did not arrive. The channel comes
 * with the channel sync a verified socket runs, a round trip well inside this; past it the spinner no
 * longer means "almost there". Without a limit, a new account whose list dropped the channel watched
 * it spin for as long as it stayed on the screen.
 */
export const SELF_CHANNEL_WAIT_MS = 15_000;

/**
 * First-run onboarding (2 cards): a welcome, then the handful of things worth
 * knowing before the first message. Every signed-in landing gets it, not only a
 * guest on the Default Cloud — an invited member arrives in a workspace with
 * clouds, places and a switcher nobody has mentioned to them.
 *
 * Any close marks it seen — the Done button, the X, Escape, an overlay click.
 * A dismissal used to live only in memory so that a stray Escape could not lose
 * the tips for good, but the page reloads on its own (the renderer self-heals a
 * socket wedged after sleep by reloading), and each reload brought the dialog
 * back to a person who had already closed it. Losing them for good is no longer
 * the risk it was: Settings reopens them on demand.
 */
export const OnboardingDialog = ({ enabled, showChannelStatus, isChannelReady }: OnboardingDialogProps) => {
    const { t } = useTranslation();
    const userId = runtime.session.useSessionIdentity().userId;
    const { channel: channelRepository } = runtime.data.useRuntimeRepositories();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<1 | 2>(1);
    // Checked once per account per session, as soon as the account is known: a
    // later change of cloud, or a return from another screen, must not re-trigger it.
    const checkedFor = useOnboardingStore(s => s.checkedFor);
    const markChecked = useOnboardingStore(s => s.markChecked);
    useEffect(() => {
        if (!enabled || !userId || checkedFor === userId) return;
        markChecked(userId);
        if (!hasSeenOnboarding(userId)) setOpen(true);
    }, [enabled, userId, checkedFor, markChecked]);

    const reopenRequested = useOnboardingStore(s => s.reopenRequested);
    const consumeReopen = useOnboardingStore(s => s.consumeReopen);
    useEffect(() => {
        if (!reopenRequested) return;
        consumeReopen();
        setStep(1);
        setOpen(true);
    }, [reopenRequested, consumeReopen]);

    // The row's wait: restarted by a retry, cleared the moment the channel shows up.
    const [attempt, setAttempt] = useState(0);
    const [timedOut, setTimedOut] = useState(false);
    const isWaiting = open && showChannelStatus && !isChannelReady;
    useEffect(() => {
        setTimedOut(false);
        if (!isWaiting) return;
        const timer = setTimeout(() => setTimedOut(true), SELF_CHANNEL_WAIT_MS);
        return () => clearTimeout(timer);
    }, [isWaiting, attempt]);
    // A full channel sync, not a wait alone: the channel reaches the list through that sync, and a
    // retry that asked nothing again could only time out again. Its cursor is left as it was.
    const retry = () => {
        setAttempt(n => n + 1);
        void channelRepository.syncChannels(0).catch(() => undefined);
    };

    if (!enabled && !open) return null;

    // Both close paths write the flag, so a dismissal survives the next reload.
    // The in-session store flag above only covers this page's lifetime.
    const close = () => {
        if (userId) markOnboardingSeen(userId);
        setOpen(false);
    };

    const stepLabel = (
        <p className="text-micro tabular-nums text-muted-foreground">{t('onboarding.step', { step, total: 2 })}</p>
    );

    return (
        <Dialog open={open} onOpenChange={isOpen => !isOpen && close()}>
            {/* Opened from state, so there is no opener to go back to: the room's message box is
                where the tips point next. */}
            <DialogContent
                closeLabel={t('common.close')}
                className="sm:max-w-sm"
                onCloseAutoFocus={focusComposerIfDropped}
            >
                {step === 1 ? (
                    <>
                        {stepLabel}
                        <DialogTitle>{t('onboarding.welcome.title')}</DialogTitle>
                        {/* The Default Cloud opens on a private Self Channel; a real
                            workspace opens on other people's channels. Saying the
                            first thing in both places was simply wrong in one. */}
                        <DialogDescription>
                            {t(showChannelStatus ? 'onboarding.welcome.body' : 'onboarding.welcome.bodyWorkspace')}
                        </DialogDescription>
                        {showChannelStatus && (
                            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-callout text-muted-foreground">
                                {isChannelReady ? (
                                    <Check size={16} className="shrink-0 text-primary-ink" aria-hidden />
                                ) : timedOut ? (
                                    <AlertCircle size={16} className="shrink-0 text-destructive" aria-hidden />
                                ) : (
                                    <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary motion-reduce:animate-none" />
                                )}
                                {/* Announced as it changes; the retry sits outside the live region. */}
                                <span role="status" className="flex-1">
                                    {t(
                                        isChannelReady
                                            ? 'onboarding.welcome.ready'
                                            : timedOut
                                              ? 'onboarding.welcome.failed'
                                              : 'onboarding.welcome.preparing'
                                    )}
                                </span>
                                {!isChannelReady && timedOut && (
                                    <Button type="button" variant="ghost" size="sm" className="-my-1" onClick={retry}>
                                        {t('onboarding.welcome.retry')}
                                    </Button>
                                )}
                            </div>
                        )}
                        <div className="flex justify-end pt-2">
                            <Button type="button" onClick={() => setStep(2)}>
                                {t('onboarding.next')}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        {stepLabel}
                        <DialogTitle>{t('onboarding.tips.title')}</DialogTitle>
                        {/* The title was also the description, so the card said its own
                            heading twice and a screen reader read it twice. */}
                        <DialogDescription>{t('onboarding.tips.body')}</DialogDescription>
                        <ul className="flex flex-col gap-2 pt-2 text-callout text-foreground">
                            <li>{t('onboarding.tips.send')}</li>
                            {/* What the rail and the switcher are for: the two things a
                                new member cannot guess from looking at the screen. */}
                            <li>{t('onboarding.tips.places')}</li>
                            <li>{t('onboarding.tips.switcher')}</li>
                            <li>{t('onboarding.tips.shortcuts')}</li>
                        </ul>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                                {t('onboarding.back')}
                            </Button>
                            <Button type="button" onClick={close}>
                                {t('onboarding.done')}
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
};
