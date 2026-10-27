import { type JSX, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EmailVerificationForm } from '../../components';
import { Button, Dialog, useToast } from '../../components/ui';
import { useBillingInfo } from '../../hooks';

import type { BillingEmail } from '../../types';

const k = (key: string) => `subscription.billing.info.dialog.${key}`;

/**
 * Adding a billing address, or finishing the verification of one already waiting for it (`waiting`).
 * The shared form does the verifying; this popup only frames it and closes on "done".
 *
 * An address joins the list, waiting, as soon as a code is sent to it, and stays there if the reader
 * walks away — that is what the row's "verify" is for. Asking for a code for a waiting address hands
 * back its live code, or a fresh one once that has run out, so finishing one later is the same form
 * with the address already filled in.
 */
export const BillingEmailAddDialog = ({
    waiting,
    onClose,
}: {
    waiting?: BillingEmail;
    onClose: () => void;
}): JSX.Element => {
    const { t } = useTranslation();
    const toast = useToast();
    const billing = useBillingInfo();
    const [verified, setVerified] = useState<BillingEmail>();
    const [known, setKnown] = useState(false);
    const [busy, setBusy] = useState(false);
    // The reader can type over the waiting address or pick another; from then on this adds one.
    const [finishing, setFinishing] = useState(Boolean(waiting));
    // The address a code was sent to from this popup.
    const sentTo = useRef<string | undefined>(undefined);

    // An address already verified here needs no code; the form would take it as it is, and "done"
    // would then claim an address was added when nothing changed.
    const refuse = (address: string): string | undefined => {
        const match = billing.data?.emails.find(email => email.address.toLowerCase() === address.toLowerCase());
        if (match?.primary) return 'subscription.common.email.error.registered';
        return match?.status === 'verified' ? k('alreadyVerified') : undefined;
    };

    // The list above can be stale (verified in another tab), so the form may still hand back an
    // address that was verified before this popup sent it anything. That is not an addition either.
    const accept = (email: BillingEmail) => {
        if (email.id === sentTo.current || email.id === waiting?.id) setVerified(email);
        else setKnown(true);
    };

    const finish = () => {
        toast(t(k('added')));
        onClose();
    };

    return (
        <Dialog
            open
            onOpenChange={open => !open && !busy && onClose()}
            className="max-w-[528px]"
            title={t(k(finishing ? 'titleVerify' : 'titleAdd'))}
            description={t(k(finishing ? 'bodyVerify' : 'bodyAdd'))}
            footer={
                <>
                    <Button variant="secondary" size="lg" disabled={busy} onClick={onClose}>
                        {t('subscription.common.actions.cancel')}
                    </Button>
                    <Button size="lg" disabled={!verified || busy} onClick={finish}>
                        {t(k('confirm'))}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <EmailVerificationForm
                    idPrefix="billing-email-add"
                    label={t(k('address'))}
                    initialAddress={waiting?.address}
                    refuse={refuse}
                    onPending={id => {
                        sentTo.current = id;
                        if (id !== waiting?.id) setFinishing(false);
                    }}
                    onVerified={accept}
                    onReset={() => {
                        sentTo.current = undefined;
                        setVerified(undefined);
                        setKnown(false);
                        setFinishing(false);
                    }}
                    onBusyChange={setBusy}
                />
                {verified && <p className="text-xs text-status-success">{t(k('verified'))}</p>}
                {known && (
                    <p role="alert" className="text-xs text-status-danger">
                        {t(k('alreadyVerified'))}
                    </p>
                )}
            </div>
        </Dialog>
    );
};
