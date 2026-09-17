import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { ONBOARDED_KEY, useOnboardingStore } from '../stores';

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
 * First-run onboarding (2 cards): a welcome, then the handful of things worth
 * knowing before the first message. Every signed-in landing gets it, not only a
 * guest on the Default Cloud — an invited member arrives in a workspace with
 * clouds, places and a switcher nobody has mentioned to them.
 *
 * Only finishing it — the Done button — marks it seen. Escape or an overlay
 * click used to write the same flag, so one stray key press lost the tips for
 * good; now it just closes them for this session. Settings can reopen them.
 */
export const OnboardingDialog = ({ enabled, showChannelStatus, isChannelReady }: OnboardingDialogProps) => {
    const { t } = useTranslation();
    // Captured once at mount: a mid-session switch to the Default Cloud must not
    // re-trigger onboarding, so `enabled` is read inside the lazy initializer.
    const [open, setOpen] = useState(() => enabled && localStorage.getItem(ONBOARDED_KEY) !== '1');
    const [step, setStep] = useState<1 | 2>(1);

    const reopenNonce = useOnboardingStore(s => s.reopenNonce);
    useEffect(() => {
        if (reopenNonce === 0) return;
        setStep(1);
        setOpen(true);
    }, [reopenNonce]);

    // A reopen from Settings works on any cloud; the first-run trigger is guest-only.
    if (!enabled && reopenNonce === 0) return null;

    const finish = () => {
        localStorage.setItem(ONBOARDED_KEY, '1');
        setOpen(false);
    };

    const stepLabel = (
        <p className="text-xs tabular-nums text-muted-foreground">{t('onboarding.step', { step, total: 2 })}</p>
    );

    return (
        <Dialog open={open} onOpenChange={isOpen => !isOpen && setOpen(false)}>
            <DialogContent className="sm:max-w-sm">
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
                            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                                {isChannelReady ? (
                                    <Check size={16} className="shrink-0 text-primary-ink" />
                                ) : (
                                    <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary motion-reduce:animate-none" />
                                )}
                                <span>
                                    {t(isChannelReady ? 'onboarding.welcome.ready' : 'onboarding.welcome.preparing')}
                                </span>
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
                        <DialogDescription className="sr-only">{t('onboarding.tips.title')}</DialogDescription>
                        <ul className="flex flex-col gap-2 pt-2 text-sm text-foreground">
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
                            <Button type="button" onClick={finish}>
                                {t('onboarding.done')}
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
};
