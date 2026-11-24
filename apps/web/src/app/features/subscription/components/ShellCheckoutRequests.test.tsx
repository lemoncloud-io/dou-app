import { act, render, screen as view } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { ShellCheckoutRequest } from '../lib';
import { ShellCheckoutRequests } from './ShellCheckoutRequests';

const Where = () => {
    const location = useLocation();
    return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
};

describe('ShellCheckoutRequests', () => {
    it('opens the shell checkout screen the checkout port asks for, and unbinds when it goes', () => {
        let open: ((request: ShellCheckoutRequest) => void) | undefined;
        const unbind = jest.fn();
        const screen = {
            sandbox: false,
            bind: jest.fn((fn: (request: ShellCheckoutRequest) => void) => {
                open = fn;
                return unbind;
            }),
        };
        const { unmount } = render(
            <MemoryRouter initialEntries={['/subscription/plans']}>
                <ShellCheckoutRequests screen={screen} />
                <Routes>
                    <Route path="*" element={<Where />} />
                </Routes>
            </MemoryRouter>
        );

        act(() => open?.({ replace: true }));

        expect(view.getByTestId('where').textContent).toBe('/subscription/shell-checkout');
        unmount();
        expect(unbind).toHaveBeenCalled();
    });
});
