import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/web-ui-kit';

import type { RegistrationOutcome } from '@chatic/web-checkout';

export const StandInCardDialog = ({ onAnswer }: { onAnswer: (outcome: RegistrationOutcome) => void }) => {
    const { t } = useTranslation();
    return (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-end bg-black/40">
            <div className="flex w-full flex-col gap-3 rounded-t-2xl bg-background p-5">
                <p className="text-[17px] font-semibold text-foreground">
                    {t('mypage.subscription.inAppCheckout.standIn.title')}
                </p>
                <p className="text-[14px] text-muted-foreground">
                    {t('mypage.subscription.inAppCheckout.standIn.description')}
                </p>
                <Button tone="green" fullWidth onClick={() => onAnswer('registered')}>
                    {t('mypage.subscription.inAppCheckout.standIn.register')}
                </Button>
                <Button variant="outline" fullWidth onClick={() => onAnswer('failed')}>
                    {t('mypage.subscription.inAppCheckout.standIn.decline')}
                </Button>
                <Button variant="ghost" fullWidth onClick={() => onAnswer('closed')}>
                    {t('common.cancel')}
                </Button>
            </div>
        </div>
    );
};
