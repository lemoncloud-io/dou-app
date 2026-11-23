import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useCompletePaymentMethodRegistration } from '../../hooks';
import { takePendingCardChange } from '../../lib/pendingCheckout';

import type { RegistrationResult } from '../../types';

export const useCardWindowReturn = ({
    onResult,
    onError,
}: {
    onResult: (result: RegistrationResult) => void;
    onError: (error: unknown) => void;
}): boolean => {
    const complete = useCompletePaymentMethodRegistration();
    const [params, setParams] = useSearchParams();
    const read = useRef(false);

    useEffect(() => {
        if (read.current || !(params.has('billingKey') || params.has('code'))) return;
        read.current = true;
        const callback = new URLSearchParams(params);
        setParams({}, { replace: true });
        const saved = takePendingCardChange();
        if (!saved) return;
        complete.mutateAsync({ callback, purpose: 'addCard', payer: saved }).then(onResult).catch(onError);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return complete.isPending;
};
