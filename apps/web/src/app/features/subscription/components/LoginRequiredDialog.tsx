import { useTranslation } from 'react-i18next';

import { AlertDialog } from '@chatic/web-ui-kit';

interface LoginRequiredDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
}

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
