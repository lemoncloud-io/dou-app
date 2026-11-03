import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { WebCheckoutHandoff } from './WebCheckoutHandoff';
import { leaveForWeb } from './leaveForWeb';
import { WEB_SUBSCRIPTION_URL } from '../consts';
import { usePlanCatalog } from '../hooks';
import { useMembershipInfo } from '../../../hooks/useMembership';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let mockNative = false;
jest.mock('@chatic/bridges', () => ({ ...jest.requireActual('@chatic/bridges'), isNative: () => mockNative }));
jest.mock('../hooks', () => ({ usePlanCatalog: jest.fn() }));
jest.mock('../consts', () => ({
    WEB_SUBSCRIPTION_URL: { plans: 'https://web.example/subscription/plans', list: 'https://web.example/subscription' },
}));
jest.mock('../../../hooks/useMembership', () => ({ useMembershipInfo: jest.fn() }));
jest.mock('./leaveForWeb', () => ({ leaveForWeb: jest.fn() }));

type Read = 'success' | 'pending' | 'error';

const show = ({
    hasLiveReceipt = false,
    platform,
    read = 'success',
}: {
    hasLiveReceipt?: boolean;
    platform?: string;
    read?: Read;
}) => {
    (usePlanCatalog as jest.Mock).mockReturnValue({ summary: { hasLiveReceipt } });
    (useMembershipInfo as jest.Mock).mockReturnValue({
        data: read === 'success' && platform ? { platform } : undefined,
        isSuccess: read === 'success',
        isError: read === 'error',
    });
    return render(
        <WebCheckoutHandoff>
            <div>store screen</div>
        </WebCheckoutHandoff>
    );
};

beforeEach(() => {
    jest.clearAllMocks();
    mockNative = false;
});

describe('WebCheckoutHandoff', () => {
    it('in the app: shows the store screen and never leaves', () => {
        mockNative = true;
        show({});

        expect(screen.getByText('store screen')).toBeInTheDocument();
        expect(leaveForWeb).not.toHaveBeenCalled();
    });

    it("in a browser with no subscription: replaces this entry with the website's plans page", () => {
        show({});

        expect(leaveForWeb).toHaveBeenCalledWith(WEB_SUBSCRIPTION_URL.plans, { replace: true });
        expect(screen.queryByText('store screen')).not.toBeInTheDocument();
        expect(screen.getByText('mypage.subscription.toWebCheckout')).toBeInTheDocument();
    });

    it('in a browser with a subscription the website bills: hands over too', () => {
        show({ hasLiveReceipt: true, platform: 'stripe' });

        expect(leaveForWeb).toHaveBeenCalledWith(WEB_SUBSCRIPTION_URL.plans, { replace: true });
    });

    it('in a browser with a running store subscription: stays on the screen that says where to change it', () => {
        show({ hasLiveReceipt: true, platform: 'apple' });

        expect(screen.getByText('store screen')).toBeInTheDocument();
        expect(leaveForWeb).not.toHaveBeenCalled();
    });

    it('in a browser while the membership is still being read: waits, neither leaving nor showing the store screen', () => {
        show({ read: 'pending' });

        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.queryByText('store screen')).not.toBeInTheDocument();
        expect(leaveForWeb).not.toHaveBeenCalled();
    });

    it('in a browser when the membership could not be read: stays, since it may be a store subscriber', () => {
        show({ read: 'error' });

        expect(screen.getByText('store screen')).toBeInTheDocument();
        expect(leaveForWeb).not.toHaveBeenCalled();
    });
});
