import { useTranslation } from 'react-i18next';

import { AlertDialog } from '@chatic/web-ui-kit';

interface AddCloudLimitDialogProps {
    open: boolean;
    /** The allowance that is used up. */
    limit: number;
    /** A higher tier is on sale, so the dialog may offer to change the plan. */
    canChangePlan: boolean;
    onClose: () => void;
    onChangePlan: () => void;
}

/**
 * "No more clouds" — shown when the add-cloud flow is refused by the allowance (Figma 4998-52922
 * with the plan-change offer, 4999-53210 at the top tier).
 *
 * Two dialogs rather than one with a disabled button: at the top tier there is nothing to offer,
 * and a dead "change plan" button would read as broken. The toast this replaces could not carry an
 * action at all, which left the user to find the plan picker on their own.
 */
export const AddCloudLimitDialog = ({
    open,
    limit,
    canChangePlan,
    onClose,
    onChangePlan,
}: AddCloudLimitDialogProps) => {
    const { t } = useTranslation();

    return (
        <AlertDialog
            open={open}
            onOpenChange={isOpen => !isOpen && onClose()}
            title={t('addAccount.limitDialog.title')}
            description={
                <span className="whitespace-pre-line">
                    {canChangePlan
                        ? t('addAccount.limitDialog.changeableDescription', { max: limit })
                        : t('addAccount.limitDialog.topDescription')}
                </span>
            }
            cancelLabel={canChangePlan ? t('common.cancel') : undefined}
            confirmLabel={canChangePlan ? t('addAccount.limitDialog.changePlan') : t('common.confirm')}
            onConfirm={canChangePlan ? onChangePlan : onClose}
        />
    );
};
