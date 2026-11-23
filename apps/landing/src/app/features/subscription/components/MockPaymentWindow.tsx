import { type JSX, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type PaymentWindowHost, type PaymentWindowRequest } from '../lib/port/standInWindow';
import { Button, Dialog } from './ui';

import type { RegistrationOutcome } from '../types';

const OUTCOMES: RegistrationOutcome[] = ['registered', 'failed', 'closed'];

export const MockPaymentWindow = ({ host }: { host: PaymentWindowHost }): JSX.Element | null => {
    const { t } = useTranslation();
    const [request, setRequest] = useState<PaymentWindowRequest | null>(null);
    const resolver = useRef<((outcome: RegistrationOutcome) => void) | null>(null);

    useEffect(() => {
        host.setPaymentWindow(
            next =>
                new Promise<RegistrationOutcome>(resolve => {
                    resolver.current?.('closed');
                    resolver.current = resolve;
                    setRequest(next);
                })
        );
        return () => {
            host.setPaymentWindow(null);
            resolver.current?.('closed');
            resolver.current = null;
        };
    }, [host]);

    const finish = (outcome: RegistrationOutcome) => {
        resolver.current?.(outcome);
        resolver.current = null;
        setRequest(null);
    };

    return (
        <Dialog
            open={request !== null}
            onOpenChange={open => !open && finish('closed')}
            title={t('subscription.common.paymentWindow.title')}
            description={t('subscription.common.paymentWindow.description')}
        >
            <div className="flex flex-col gap-2">
                {OUTCOMES.map(outcome => (
                    <Button
                        key={outcome}
                        variant={outcome === 'registered' ? 'primary' : 'secondary'}
                        size="lg"
                        autoFocus={outcome === request?.suggested}
                        data-suggested={outcome === request?.suggested || undefined}
                        className="data-[suggested]:ring-2 data-[suggested]:ring-navy/40"
                        onClick={() => finish(outcome)}
                    >
                        {t(`subscription.common.paymentWindow.${outcome}`)}
                    </Button>
                ))}
            </div>
        </Dialog>
    );
};
