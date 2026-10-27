import { renderHook } from '@testing-library/react';

import { useCloudQuota } from './useCloudQuota';
import { usePlanCatalog } from './usePlanCatalog';
import { useClouds } from '../../../hooks/useCloudCatalog';
import { useMembershipInfo } from '../../../hooks/useMembership';

jest.mock('./usePlanCatalog', () => ({ usePlanCatalog: jest.fn() }));
jest.mock('../../../hooks/useCloudCatalog', () => ({ useClouds: jest.fn() }));
jest.mock('../../../hooks/useMembership', () => ({ useMembershipInfo: jest.fn() }));

const given = ({ isValid, used }: { isValid?: boolean; used: number }) => {
    (usePlanCatalog as jest.Mock).mockReturnValue({
        summary: { state: 'cancelScheduled', isEntitled: true },
        currentPlan: { id: '#pro-tier-03', sort: 3, maxClouds: 3 },
        isLoading: false,
    });
    (useClouds as jest.Mock).mockReturnValue({
        data: { list: Array.from({ length: used }, (_, i) => ({ id: `c${i}`, status: 'active' })) },
        isLoading: false,
    });
    (useMembershipInfo as jest.Mock).mockReturnValue({ data: isValid === undefined ? undefined : { isValid } });
    return renderHook(() => useCloudQuota()).result.current;
};

describe('useCloudQuota — the server’s provisioning verdict', () => {
    it('lets an ending subscription the server still finds valid add a cloud', () => {
        expect(given({ isValid: true, used: 1 })).toMatchObject({ canAdd: true, used: 1, limit: 3 });
    });

    it('refuses with its own reason once the server finds the membership invalid', () => {
        expect(given({ isValid: false, used: 1 })).toMatchObject({ canAdd: false, reason: 'canceled' });
    });

    it('still reports a used-up allowance as the limit, not as a cancellation', () => {
        expect(given({ isValid: true, used: 3 })).toMatchObject({ canAdd: false, reason: 'limitReached' });
    });
});
