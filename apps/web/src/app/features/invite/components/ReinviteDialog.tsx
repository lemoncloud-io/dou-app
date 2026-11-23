import { useTranslation } from 'react-i18next';

import { AlertDialog } from '@chatic/web-ui-kit';

import { type ReinviteVariant } from '../utils/inviteStatus';

interface ReinviteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    variant: ReinviteVariant;
    onViewWaiting: () => void;
    onReissue: () => void;
}

export const ReinviteDialog = ({ open, onOpenChange, variant, onViewWaiting, onReissue }: ReinviteDialogProps) => {
    const { t } = useTranslation();

    if (variant === 'pending') {
        return (
            <AlertDialog
                open={open}
                onOpenChange={onOpenChange}
                title={t('contactInvite.reinvite.pending.title')}
                description={t('contactInvite.reinvite.pending.description')}
                cancelLabel={t('common.cancel')}
                confirmLabel={t('contactInvite.reinvite.pending.confirm')}
                onConfirm={onViewWaiting}
            />
        );
    }

    return (
        <AlertDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t(`contactInvite.reinvite.${variant}.title`)}
            description={t(`contactInvite.reinvite.${variant}.description`)}
            cancelLabel={t('common.cancel')}
            confirmLabel={t('contactInvite.reinvite.reissueConfirm')}
            onConfirm={onReissue}
        />
    );
};
