import { type JSX, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EmailVerificationForm } from '../../components';
import { Button, Dialog, useToast } from '../../components/ui';
import { useBillingInfo } from '../../hooks';

import type { BillingEmail } from '@chatic/web-checkout';

const k = (key: string) => `subscription.billing.info.dialog.${key}`;

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
    const [finishing, setFinishing] = useState(Boolean(waiting));
    const sentTo = useRef<string | undefined>(undefined);

    const refuse = (address: string): string | undefined => {
        const match = billing.data?.emails.find(email => email.address.toLowerCase() === address.toLowerCase());
        if (match?.primary) return 'subscription.common.email.error.registered';
        return match?.status === 'verified' ? k('alreadyVerified') : undefined;
    };

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
