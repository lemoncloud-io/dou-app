import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useCompletePaymentMethodRegistration } from '../../hooks';
import { takePendingCardChange } from '../../lib/pendingCheckout';

import type { RegistrationResult } from '../../types';

/**
 * The return of a card window that left the page. On a phone the payment provider's window is its own
 * page: W-12 saves the payer (`savePendingCardChange`) and the browser comes back to W-12 with the
 * result in the query — `billingKey`, or `code` and `message`. This reads it once, clears the address,
 * and hands the result on as the window's own answer would have been. A return with no payer saved
 * for it is ignored.
 *
 * Answers whether a return is being read.
 */
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
        // Once per arrival: the result is read from the address, which is cleared above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return complete.isPending;
};
