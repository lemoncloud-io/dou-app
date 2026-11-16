import { useQuery } from '@tanstack/react-query';

import { type ForeignBilling, foreignBillingOf } from '../lib/billingCountry';
import { usePort } from '../lib/port';
import { subscriptionKeys } from './keys';
import { useSession } from './session';

const DOLLARS = 'USD';

/**
 * Whether billing outside Korea, in dollars, is open — `foreignBillingOf` over the server's dollar
 * catalog, read with the reader's session. It is the dollar plans query itself (`usePlans('USD')`, the
 * same key), and the HTTP port keeps each provider's catalog for the page, so asking adds no call that
 * the plans page in dollars would not make anyway.
 *
 * `enabled` false skips the read where the answer cannot change what is shown — a Korean reader's plans,
 * a checkout in Korea — and is `shut`.
 */
export const useForeignBilling = ({ enabled = true }: { enabled?: boolean } = {}): ForeignBilling => {
    const port = usePort();
    const session = useSession();
    const signedIn = session.isPending ? undefined : !!session.data;
    const dollarPlans = useQuery({
        queryKey: subscriptionKeys.plans(DOLLARS),
        queryFn: () => port.listPlans({ currency: DOLLARS }),
        enabled: enabled && !!signedIn,
    });
    if (!enabled) return 'shut';
    return foreignBillingOf({ signedIn, dollarPlans: dollarPlans.data, failed: dollarPlans.isError });
};
