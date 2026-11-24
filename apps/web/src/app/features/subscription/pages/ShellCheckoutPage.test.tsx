import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SHELL_CHECKOUT_PATH, ShellCheckoutPage } from './ShellCheckoutPage';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => jest.fn(),
}));

const show = (search: string, client = new QueryClient()) =>
    render(
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[`${SHELL_CHECKOUT_PATH}${search}`]}>
                <Routes>
                    <Route path={SHELL_CHECKOUT_PATH} element={<ShellCheckoutPage />} />
                    <Route path="/" element={<p>home</p>} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    );

describe('ShellCheckoutPage', () => {
    it("opens the subscription website's checkout inside the app's screen", () => {
        const url = 'http://localhost:5004/subscription/plans?sandbox=1';
        show(`?${new URLSearchParams({ url })}`);
        expect(screen.getByTitle('mypage.subscription.shellCheckout.title')).toHaveAttribute('src', url);
    });

    it('opens nothing for an address that is not http', () => {
        show(`?${new URLSearchParams({ url: 'javascript:alert(1)' })}`);
        expect(screen.queryByTitle('mypage.subscription.shellCheckout.title')).not.toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent('mypage.subscription.shellCheckout.noAddress');
    });

    it('reads the membership again when the screen is left, the server holding the result', () => {
        const client = new QueryClient();
        const invalidate = jest.spyOn(client, 'invalidateQueries');
        const { unmount } = show(
            `?${new URLSearchParams({ url: 'https://app-dev.chatic.io/subscription/plans' })}`,
            client
        );
        unmount();
        expect(invalidate).toHaveBeenCalled();
    });
});
