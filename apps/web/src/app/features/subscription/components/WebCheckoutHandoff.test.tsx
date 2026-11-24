import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { WebCheckoutHandoff } from './WebCheckoutHandoff';
import { usePlanCatalog } from '../hooks';
import { useMembershipInfo } from '../../../hooks/useMembership';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let mockNative = false;
const mockStore = { kind: 'store', store: 'apple', openManagement: jest.fn() };
const mockWeb = { kind: 'web', open: jest.fn() };
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        get checkout() {
            return mockNative ? mockStore : mockWeb;
        },
    })
);
jest.mock('../hooks', () => ({ usePlanCatalog: jest.fn() }));
jest.mock('../../../hooks/useMembership', () => ({ useMembershipInfo: jest.fn() }));

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
        <MemoryRouter initialEntries={['/subscription/plans']}>
            <Routes>
                <Route
                    path="/subscription/plans"
                    element={
                        <WebCheckoutHandoff>
                            <div>store screen</div>
                        </WebCheckoutHandoff>
                    }
                />
                <Route path="/subscription/checkout" element={<div>in-app checkout</div>} />
            </Routes>
        </MemoryRouter>
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
        expect(mockWeb.open).not.toHaveBeenCalled();
    });

    it('in a browser with no subscription: replaces this entry with the in-app checkout, never leaving the app', () => {
        show({});

        expect(screen.getByText('in-app checkout')).toBeInTheDocument();
        expect(screen.queryByText('store screen')).not.toBeInTheDocument();
        expect(mockWeb.open).not.toHaveBeenCalled();
    });

    it('in a browser with a subscription the website bills: hands over too', () => {
        show({ hasLiveReceipt: true, platform: 'stripe' });

        expect(screen.getByText('in-app checkout')).toBeInTheDocument();
    });

    it('in a browser with a running store subscription: stays on the screen that says where to change it', () => {
        show({ hasLiveReceipt: true, platform: 'apple' });

        expect(screen.getByText('store screen')).toBeInTheDocument();
        expect(screen.queryByText('in-app checkout')).not.toBeInTheDocument();
    });

    it('in a browser while the membership is still being read: waits, neither leaving nor showing the store screen', () => {
        show({ read: 'pending' });

        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.queryByText('store screen')).not.toBeInTheDocument();
        expect(mockWeb.open).not.toHaveBeenCalled();
    });

    it('in a browser when the membership could not be read: stays, since it may be a store subscriber', () => {
        show({ read: 'error' });

        expect(screen.getByText('store screen')).toBeInTheDocument();
        expect(mockWeb.open).not.toHaveBeenCalled();
    });
});
