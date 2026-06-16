import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

const ONBOARDED_KEY = 'chatic.desktop.onboarded';

interface OnboardingDialogProps {
    /** Default Cloud (guest) only — invite users joined a real workspace, no self-channel wait. */
    enabled: boolean;
    /** Self Channel has loaded — flips the welcome card from spinner to ready. */
    isChannelReady: boolean;
}

/**
 * First-run onboarding (2 cards): welcomes the guest while the Self Channel is
 * provisioning (slow on first access) and explains what it is, then a tips card.
 * Shows once — any dismissal (Done, Esc, overlay click) writes a localStorage
 * flag so it never reappears.
 */
export const OnboardingDialog = ({ enabled, isChannelReady }: OnboardingDialogProps) => {
    const { t } = useTranslation();
    // Captured once at mount: a mid-session switch to the Default Cloud must not
    // re-trigger onboarding, so `enabled` is read inside the lazy initializer.
    const [open, setOpen] = useState(() => enabled && localStorage.getItem(ONBOARDED_KEY) !== '1');
    const [step, setStep] = useState<1 | 2>(1);

    if (!enabled) return null;

    const close = () => {
        localStorage.setItem(ONBOARDED_KEY, '1');
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={isOpen => !isOpen && close()}>
            <DialogContent className="sm:max-w-sm">
                {step === 1 ? (
                    <>
                        <DialogTitle>{t('onboarding.welcome.title')}</DialogTitle>
                        <DialogDescription>{t('onboarding.welcome.body')}</DialogDescription>
                        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                            {isChannelReady ? (
                                <Check size={16} className="shrink-0 text-primary" />
                            ) : (
                                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary motion-reduce:animate-none" />
                            )}
                            <span>
                                {t(isChannelReady ? 'onboarding.welcome.ready' : 'onboarding.welcome.preparing')}
                            </span>
                        </div>
                        <div className="flex justify-end pt-2">
                            <Button type="button" onClick={() => setStep(2)}>
                                {t('onboarding.next')}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <DialogTitle>{t('onboarding.tips.title')}</DialogTitle>
                        <DialogDescription className="sr-only">{t('onboarding.tips.title')}</DialogDescription>
                        <ul className="flex flex-col gap-2 pt-2 text-sm text-foreground">
                            <li>{t('onboarding.tips.send')}</li>
                            <li>{t('onboarding.tips.shortcuts')}</li>
                            <li>{t('onboarding.tips.invite')}</li>
                        </ul>
                        <div className="flex justify-end pt-2">
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
