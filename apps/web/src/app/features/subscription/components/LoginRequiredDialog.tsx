import { useTranslation } from 'react-i18next';

import { AlertDialog } from '@chatic/web-ui-kit';

interface LoginRequiredDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
}

/**
 * Asks before sending a guest to login (Figma 2870-33015).
 *
 * The flow used to navigate the moment a guest tapped 구독하기, which reads as the app losing their
 * place mid-decision. Confirming first keeps the choice theirs.
 */
export const LoginRequiredDialog = ({ open, onOpenChange, onConfirm }: LoginRequiredDialogProps) => {
    const { t } = useTranslation();

    return (
        <AlertDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('mypage.subscription.loginRequiredTitle')}
            cancelLabel={t('common.cancel')}
            confirmLabel={t('mypage.subscription.loginCta')}
            onConfirm={onConfirm}
        />
    );
};
