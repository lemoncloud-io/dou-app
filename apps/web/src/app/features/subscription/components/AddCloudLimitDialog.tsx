import { useTranslation } from 'react-i18next';

import { AlertDialog } from '@chatic/web-ui-kit';

interface AddCloudLimitDialogProps {
    open: boolean;
    limit: number;
    canChangePlan: boolean;
    onClose: () => void;
    onChangePlan: () => void;
    onManageSubscription: () => void;
}

export const AddCloudLimitDialog = ({
    open,
    limit,
    canChangePlan,
    onClose,
    onChangePlan,
    onManageSubscription,
}: AddCloudLimitDialogProps) => {
    const { t } = useTranslation();

    return (
        <AlertDialog
            open={open}
            onOpenChange={isOpen => !isOpen && onClose()}
            title={
                canChangePlan ? t('addAccount.limitDialog.title') : t('addAccount.limitDialog.topTitle', { max: limit })
            }
            description={
                <span className="whitespace-pre-line">
                    {canChangePlan
                        ? t('addAccount.limitDialog.changeableDescription', { max: limit })
                        : t('addAccount.limitDialog.topDescription')}
                </span>
            }
            cancelLabel={t('common.cancel')}
            confirmLabel={
                canChangePlan ? t('addAccount.limitDialog.changePlan') : t('addAccount.limitDialog.manageSubscription')
            }
            onConfirm={canChangePlan ? onChangePlan : onManageSubscription}
        />
    );
};
