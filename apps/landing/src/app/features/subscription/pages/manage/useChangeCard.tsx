import { type JSX, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { ConfirmDialog, PayerFields } from '../../components';
import { useToast } from '../../components/ui';
import { useCompletePaymentMethodRegistration, useSession, useStartPaymentMethodRegistration } from '../../hooks';
import { savePendingCardChange, takePendingCardChange } from '../../lib/pendingCheckout';
import { EMPTY_PAYER, type PayerDraft, isPayerComplete, payerOf } from '../../lib/payer';
import { isPortError } from '../../lib/port';
import { useReportPortError } from '../billing/BillingPage';

import type { RegistrationResult } from '../../types';

/**
 * Changing the card a subscription is charged to, while the card list is hidden: ask for the payer,
 * open the payment provider's window, put the card it registers on the subscription (the server
 * replaces the card it held).
 *
 * On a phone the window is the provider's own page, so the reader comes back to this page with the
 * result in the query; the payer waits in session storage meanwhile, and the return is read here.
 */
export const useChangeCard = (): { open: () => void; busy: boolean; dialog: JSX.Element } => {
    const { t } = useTranslation();
    const toast = useToast();
    const report = useReportPortError();
    const session = useSession();
    const registration = useStartPaymentMethodRegistration();
    const complete = useCompletePaymentMethodRegistration();
    const [params, setParams] = useSearchParams();
    const [isOpen, setOpen] = useState(false);
    const [payer, setPayer] = useState<PayerDraft>(EMPTY_PAYER);
    const email = session.data?.email;
    const read = useRef(false);

    const announce = (result: RegistrationResult) => {
        if (result.outcome === 'registered') toast(t('subscription.manage.changeCard.done'));
        else if (result.outcome === 'failed') toast(t('subscription.manage.changeCard.declined'));
    };
    const fail = (error: unknown) => {
        if (isPortError(error, 'limit')) toast(t('subscription.manage.changeCard.limit'));
        else report(error);
    };

    // A window that left the page comes back with `billingKey`, or `code` and `message`.
    useEffect(() => {
        if (read.current || !(params.has('billingKey') || params.has('code'))) return;
        read.current = true;
        const callback = new URLSearchParams(params);
        setParams({}, { replace: true });
        const saved = takePendingCardChange();
        if (!saved) return;
        complete.mutateAsync({ callback, purpose: 'addCard', payer: saved }).then(announce).catch(fail);
        // Once per arrival: the result is read from the address, which is cleared above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const start = async () => {
        setOpen(false);
        const holder = payerOf(payer, email ?? '');
        // On a phone this call never returns: the page leaves for the provider's.
        savePendingCardChange(holder);
        try {
            announce(await registration.mutateAsync({ purpose: 'addCard', payer: holder }));
        } catch (error) {
            fail(error);
        } finally {
            takePendingCardChange();
        }
    };

    return {
        open: () => {
            setPayer(EMPTY_PAYER);
            setOpen(true);
        },
        busy: registration.isPending || complete.isPending,
        dialog: (
            <ConfirmDialog
                open={isOpen}
                onOpenChange={next => !next && setOpen(false)}
                title={t('subscription.manage.changeCard.title')}
                description={t('subscription.manage.changeCard.body')}
                cancelLabel={t('subscription.common.actions.close')}
                confirmLabel={t('subscription.manage.changeCard.open')}
                confirmDisabled={!isPayerComplete(payer) || !email}
                onConfirm={start}
            >
                <PayerFields idPrefix="change-card-payer" value={payer} onChange={setPayer} />
            </ConfirmDialog>
        ),
    };
};
