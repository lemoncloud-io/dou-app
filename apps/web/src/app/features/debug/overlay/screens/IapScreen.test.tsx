import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { IapScreen } from './IapScreen';
import { setDebugLanguageForTests } from '../../i18n';

const fetchProducts = jest.fn();
const fetchCurrentPurchases = jest.fn();
const purchase = jest.fn();
const openStore = jest.fn();
const openSubscriptionManagement = jest.fn();
const listeners: Record<string, (m: unknown) => void> = {};

jest.mock('../../../../bridge', () => ({
    appBridge: {
        fetchProducts: () => fetchProducts(),
        fetchCurrentPurchases: () => fetchCurrentPurchases(),
        purchase: (p: unknown) => purchase(p),
        openStore: () => openStore(),
        openSubscriptionManagement: () => openSubscriptionManagement(),
    },
}));
jest.mock('@chatic/bridges', () => ({
    logger: { warn: jest.fn(), info: jest.fn() },
    webClient: {
        onEvent: (type: string, cb: (m: unknown) => void) => {
            listeners[type] = cb;
            return jest.fn();
        },
    },
}));
jest.mock('../../lib', () => ({ copyText: jest.fn() }));

describe('IapScreen', () => {
    let restoreLanguage: () => void;

    beforeEach(() => {
        restoreLanguage = setDebugLanguageForTests('en');
        jest.clearAllMocks();
        fetchProducts.mockResolvedValue({ data: { products: [{ id: 'sub.pro.month', basePlanId: 'monthly' }] } });
    });

    afterEach(() => restoreLanguage());

    it('스토어가 돌려준 상품을 id로 보여준다', async () => {
        render(<IapScreen />);

        expect(await screen.findByText('sub.pro.month')).toBeInTheDocument();
        expect(screen.getByText('Products (1)')).toBeInTheDocument();
    });

    it('상품 조회가 실패해도 빈 목록으로 버틴다 — 앱 셸이 없으면 정상 상황이다', async () => {
        fetchProducts.mockRejectedValue(new Error('NOT_FOUND'));
        render(<IapScreen />);

        expect(await screen.findByText(/No products/)).toBeInTheDocument();
    });

    it('구매는 상품 id를 실어 보낸다', async () => {
        render(<IapScreen />);
        await userEvent.click(await screen.findByRole('button', { name: 'Buy' }));

        expect(purchase).toHaveBeenCalledWith({ id: 'sub.pro.month' });
    });

    // purchase is post-based and the result arrives as an event — calling it "purchased" from the call alone would be a lie.
    it('구매 호출 자체는 확인 없음으로 적는다', async () => {
        render(<IapScreen />);
        await userEvent.click(await screen.findByRole('button', { name: 'Buy' }));

        expect(await screen.findByText(/no confirmation/)).toBeInTheDocument();
    });

    it('구매 성공·실패 이벤트를 받아 기록에 쌓는다', async () => {
        render(<IapScreen />);
        await screen.findByText('sub.pro.month');

        act(() => {
            listeners['OnPurchaseSuccess']({ purchase: { id: 'sub.pro.month' } });
            listeners['OnPurchaseError']({ code: 'E_USER_CANCELLED' });
        });

        await waitFor(() => expect(screen.getByText(/failure .*E_USER_CANCELLED/)).toBeInTheDocument());
        expect(screen.getByText(/success/)).toBeInTheDocument();
    });

    it('스토어·구독 관리는 확인 없는 조작이다', async () => {
        render(<IapScreen />);

        await userEvent.click(screen.getByRole('button', { name: 'Store' }));

        expect(openStore).toHaveBeenCalledTimes(1);
        expect(await screen.findByText(/Open store → sent/)).toBeInTheDocument();
    });
});
