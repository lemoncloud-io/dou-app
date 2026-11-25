import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCircle, Check } from 'lucide-react';

import { RELAY_CLOUD_ID, runtime } from '@chatic/runtime';

import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit';

import { focusComposerIfDropped } from '../../../shared';
import { hasSeenOnboarding, markOnboardingSeen, useOnboardingStore } from '../stores';

interface OnboardingDialogProps {
    enabled: boolean;
    showChannelStatus: boolean;
    isChannelReady: boolean;
    hasWorkspaces: boolean;
}

export const SELF_CHANNEL_WAIT_MS = 15_000;

export const OnboardingDialog = ({
    enabled,
    showChannelStatus,
    isChannelReady,
    hasWorkspaces,
}: OnboardingDialogProps) => {
    const { t } = useTranslation();
    const sessionUid = runtime.session.useSessionIdentity().userId;
    const userId = runtime.session.useUidInCloud(RELAY_CLOUD_ID) ?? sessionUid;
    const { channel: channelRepository } = runtime.data.useRuntimeRepositories();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<1 | 2>(1);
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

    const [attempt, setAttempt] = useState(0);
    const [timedOut, setTimedOut] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const isWaiting = open && showChannelStatus && !isChannelReady;
    useEffect(() => {
        setTimedOut(false);
        if (!isWaiting) return;
        const timer = setTimeout(() => setTimedOut(true), SELF_CHANNEL_WAIT_MS);
        return () => clearTimeout(timer);
    }, [isWaiting, attempt]);
    const retry = () => {
        if (retrying) return;
        setRetrying(true);
        setAttempt(n => n + 1);
        void channelRepository
            .syncChannels(0)
            .catch(() => setTimedOut(true))
            .finally(() => setRetrying(false));
    };

    if (!enabled && !open) return null;

    const close = () => {
        if (userId) markOnboardingSeen(userId);
        setOpen(false);
    };

    const stepLabel = (
        <p className="text-micro tabular-nums text-muted-foreground">{t('onboarding.step', { step, total: 2 })}</p>
    );

    return (
        <Dialog open={open} onOpenChange={isOpen => !isOpen && close()}>
            <DialogContent
                closeLabel={t('common.close')}
                className="sm:max-w-sm"
                onCloseAutoFocus={focusComposerIfDropped}
            >
                {step === 1 ? (
                    <>
                        {stepLabel}
                        <DialogTitle>{t('onboarding.welcome.title')}</DialogTitle>
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
                        <DialogDescription>{t('onboarding.tips.body')}</DialogDescription>
                        <ul className="flex flex-col gap-2 pt-2 text-callout text-foreground">
                            <li>{t('onboarding.tips.send')}</li>
                            <li>
                                {hasWorkspaces
                                    ? t('onboarding.tips.places')
                                    : t('onboarding.tips.invite', { action: t('rail.menu.join') })}
                            </li>
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
