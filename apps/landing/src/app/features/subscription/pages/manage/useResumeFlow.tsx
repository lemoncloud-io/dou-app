import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { ConfirmDialog } from '../../components';
import { useToast } from '../../components/ui';
import { usePaymentMethods, useResumeSubscription } from '../../hooks';
import { isPortError } from '../../lib/port';
import { useManagementScreens } from '../../lib/screens';
import { chargeCardOf, resumeDialogOf } from './manageModel';

import type { ManageFormat } from './useManageFormat';
import type { Subscription } from '../../types';

/**
 * Undoing a cancellation, shared by the detail screen (a confirm dialog) and the cancel screen's
 * done state (an inline card). Either way a subscription with no card left goes to the payment
 * methods page instead — renewing needs one.
 *
 * `request()` opens whichever applies; `confirm()` resumes; `dialogs` must be rendered by the caller.
 * With `inline`, the confirm step is the caller's own card and only the no-card notice is a dialog.
 */
export const useResumeFlow = (
    sub: Subscription | undefined,
    fmt: ManageFormat,
    { inline = false, onResumed }: { inline?: boolean; onResumed?: () => void } = {}
) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const toast = useToast();
    const management = useManagementScreens();
    const methods = usePaymentMethods();
    const resume = useResumeSubscription();
    const [open, setOpen] = useState<'confirm' | 'noCard' | null>(null);

    const card = sub ? chargeCardOf(sub, methods.data ?? []) : undefined;
    // Resuming renews at the plan's price on the day the subscription would have ended.
    const copyValues = {
        date: fmt.date(sub?.endsAt),
        amount: fmt.money(fmt.planOf(sub?.planId)?.monthly),
        card: card ? fmt.card(card) : '',
    };

    const request = (): 'confirm' | 'noCard' | undefined => {
        if (!sub) return undefined;
        if (!methods.data) {
            // Which dialog applies depends on the cards; without them, say so and try again.
            if (methods.isError) {
                toast(t(`subscription.common.error.${isPortError(methods.error, 'network') ? 'network' : 'unknown'}`));
                void methods.refetch();
            }
            return undefined;
        }
        const next = resumeDialogOf(sub, methods.data);
        if (next === 'noCard' || !inline) setOpen(next);
        return next;
    };

    // The promise, not `mutate`'s callbacks: resuming refetches the subscription, which can unmount the
    // caller (the cancel screen's result turns back into its form) before the callbacks would run.
    const confirm = () => {
        if (!sub) return;
        resume.mutateAsync(sub.id).then(
            () => {
                setOpen(null);
                toast(t('subscription.manage.dialogs.resume.done'));
                onResumed?.();
            },
            (error: unknown) => {
                setOpen(null);
                // The route root takes over when the session has ended.
                if (isPortError(error, 'unauthenticated')) return;
                toast(t(`subscription.common.error.${isPortError(error, 'network') ? 'network' : 'unknown'}`));
            }
        );
    };

    const dialogs: JSX.Element = (
        <>
            <ConfirmDialog
                open={open === 'confirm'}
                onOpenChange={next => !next && setOpen(null)}
                title={t('subscription.manage.dialogs.resume.title')}
                description={t('subscription.manage.dialogs.resume.body', copyValues)}
                cancelLabel={t('subscription.common.actions.close')}
                confirmLabel={t('subscription.manage.dialogs.resume.confirm')}
                onConfirm={confirm}
                pending={resume.isPending}
            />
            <ConfirmDialog
                open={open === 'noCard'}
                onOpenChange={next => !next && setOpen(null)}
                title={t('subscription.manage.dialogs.resumeNoCard.title')}
                description={t(
                    management
                        ? 'subscription.manage.dialogs.resumeNoCard.body'
                        : 'subscription.manage.dialogs.resumeNoCard.bodyHidden'
                )}
                cancelLabel={t('subscription.common.actions.close')}
                confirmLabel={
                    management
                        ? t('subscription.manage.dialogs.resumeNoCard.confirm')
                        : t('subscription.common.actions.close')
                }
                // With the card screens hidden there is nowhere to add one: the dialog is a notice.
                onConfirm={management ? () => navigate(ROUTES.subscription.paymentMethods) : undefined}
            />
        </>
    );

    return { request, confirm, dialogs, copyValues, pending: resume.isPending, ready: !methods.isLoading };
};
