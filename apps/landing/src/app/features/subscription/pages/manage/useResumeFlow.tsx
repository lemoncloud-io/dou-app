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
import type { Subscription } from '@chatic/web-checkout';

export const useResumeFlow = (
    sub: Subscription | undefined,
    fmt: ManageFormat,
    { inline = false, onResumed }: { inline?: boolean; onResumed?: () => void } = {}
) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const toast = useToast();
    const { cards: management } = useManagementScreens();
    const methods = usePaymentMethods();
    const resume = useResumeSubscription();
    const [open, setOpen] = useState<'confirm' | 'noCard' | null>(null);

    const card = sub ? chargeCardOf(sub, methods.data ?? []) : undefined;
    const copyValues = {
        date: fmt.date(sub?.endsAt),
        amount: fmt.money(fmt.planOf(sub?.planId)?.monthly),
        card: card ? fmt.card(card) : '',
    };

    const request = (): 'confirm' | 'noCard' | undefined => {
        if (!sub) return undefined;
        if (!methods.data) {
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
                onConfirm={management ? () => navigate(ROUTES.subscription.paymentMethods) : undefined}
            />
        </>
    );

    return { request, confirm, dialogs, copyValues, pending: resume.isPending, ready: !methods.isLoading };
};
