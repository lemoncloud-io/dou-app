import { useQuery } from '@tanstack/react-query';

import { type ForeignBilling, foreignBillingOf } from '../lib/billingCountry';
import { usePort } from '../lib/port';
import { subscriptionKeys } from './keys';
import { useSession } from './session';

const DOLLARS = 'USD';

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
