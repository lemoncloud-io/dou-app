import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/web-ui-kit';

interface InviterVerifyPromptProps {
    onStart: () => void;
}

export const InviterVerifyPrompt = ({ onStart }: InviterVerifyPromptProps) => {
    const { t } = useTranslation();

    return (
        <div className="flex flex-col gap-8 pt-6">
            <div className="flex flex-col gap-4 px-4">
                <h2 className="whitespace-pre-line text-center text-[20px] font-bold leading-[27px] text-foreground">
                    {t('contactInvite.verifyPrompt.title')}
                </h2>
                <p className="whitespace-pre-line text-center text-[14px] font-medium leading-[20px] text-description">
                    {t('contactInvite.verifyPrompt.note')}
                </p>
            </div>

            <div className="px-4">
                <Button tone="green" size="lg" fullWidth onClick={onStart}>
                    {t('contactInvite.verifyPrompt.cta')}
                </Button>
            </div>
        </div>
    );
};
