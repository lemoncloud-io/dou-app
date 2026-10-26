import { type JSX, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type PaymentWindowRequest, useMockController } from '../lib/mock';
import { Button, Dialog } from './ui';

import type { RegistrationOutcome } from '../types';

const OUTCOMES: RegistrationOutcome[] = ['registered', 'failed', 'closed'];

/**
 * The stand-in for the payment provider's card window. Mounted once at the route root when the port is
 * the mock: `startPaymentMethodRegistration` opens it and waits for the reader to pick how the window
 * ends — the same promise a real provider's window resolves — so the checkout and payment-method pages
 * call the hook and never know which it was. The fail flag's outcome is focused first.
 */
export const MockPaymentWindow = (): JSX.Element | null => {
    const { t } = useTranslation();
    const controller = useMockController();
    const [request, setRequest] = useState<PaymentWindowRequest | null>(null);
    const resolver = useRef<((outcome: RegistrationOutcome) => void) | null>(null);

    useEffect(() => {
        if (!controller) return;
        controller.setPaymentWindow(
            next =>
                new Promise<RegistrationOutcome>(resolve => {
                    // One window at a time: a request still open is closed, so its caller is not
                    // left waiting on a promise nothing will settle.
                    resolver.current?.('closed');
                    resolver.current = resolve;
                    setRequest(next);
                })
        );
        return () => {
            controller.setPaymentWindow(null);
            resolver.current?.('closed');
            resolver.current = null;
        };
    }, [controller]);

    const finish = (outcome: RegistrationOutcome) => {
        resolver.current?.(outcome);
        resolver.current = null;
        setRequest(null);
    };

    if (!controller) return null;

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
