import { useTranslation } from 'react-i18next';

import { AlertDialog } from '@chatic/web-ui-kit';

import { type ReinviteVariant } from '../utils/inviteStatus';

interface ReinviteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Which copy to show — see `resolveReinviteVariant`. */
    variant: ReinviteVariant;
    /** `pending`: navigate to the existing invite's waiting screen instead of creating a new one. */
    onViewWaiting: () => void;
    /** `expired` / `declined`: proceed with issuing a fresh invite for the same recipient. */
    onReissue: () => void;
}

/**
 * Shown from `ContactInvitePage` when the entered phone number matches a previously-sent invite
 * (`useSentInviteLog`). Three copy variants (Figma 3411-18193 / 3412-18331 / 3412-18478):
 * - `pending` — a code is already outstanding; the only path forward is the waiting screen
 *   (issuing here would leave two valid codes for the same recipient).
 * - `expired` — the prior code is dead; reissuing cancels it server-side first (ADR-0043 결정 5),
 *   so the copy may truthfully say the old link is unusable.
 * - `declined` — the recipient rejected the prior invite (`state === 'rejected'`); reissuing
 *   dismisses that row locally and proceeds like a first-time invite.
 */
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

    // `expired` and `declined` share the same shape (reissue vs. cancel) — only the copy differs.
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
