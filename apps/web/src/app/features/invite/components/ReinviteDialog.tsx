import { useTranslation } from 'react-i18next';

import { AlertDialog } from '@chatic/web-ui-kit';

import type { ReinviteVariant } from '../utils/inviteStatus';

interface ReinviteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Which copy to show — see `resolveReinviteVariant`. `declined` never arrives yet (요청 2번). */
    variant: ReinviteVariant;
    /** `pending`: navigate to the existing invite's waiting screen instead of creating a new one. */
    onViewWaiting: () => void;
    /** `expired` / `declined`: proceed with issuing a fresh invite for the same recipient. */
    onReissue: () => void;
}

/**
 * Shown from `ContactInvitePage` when the entered phone number matches a previously-sent invite
 * (`useSentInviteLog`). Three copy variants (Figma 3411-18193 / 3412-18331 / 3412-18478):
 * - `pending` — a code is already outstanding; the only path forward is the waiting screen (the
 *   backend does not revoke a prior pending code on reissue, so creating a second one here would
 *   just leave two valid codes for the same recipient — see ADR-0033 요청 3번).
 * - `expired` — the prior code is dead; reissuing is safe and proceeds like a first-time invite.
 * - `declined` — reserved for when the backend adds a rejected state (요청 2번); today no state
 *   resolves to this variant, so it is unreachable but ready to wire.
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
