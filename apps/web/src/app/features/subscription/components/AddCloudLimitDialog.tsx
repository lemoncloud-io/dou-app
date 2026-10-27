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
    /** Opens the subscription list — where the top tier is sent instead of a plan change. */
    onManageSubscription: () => void;
}

/**
 * "No more clouds" — shown when the add-cloud flow is refused by the allowance (Figma 4998-52922
 * with the plan-change offer, 3486-25889 at the top tier).
 *
 * Two dialogs rather than one with a disabled button: at the top tier there is no plan to change to,
 * and a dead "change plan" button would read as broken. What is left there is to look at the clouds
 * already held, so that dialog states the ceiling and leads to the subscription list instead. The
 * toast this replaces could not carry an action at all, which left the user to find either screen on
 * their own.
 */
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
            // At the top tier the allowance in force is the catalog's ceiling, so `limit` is the
            // number to state — read from the plan rather than written into the copy.
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
