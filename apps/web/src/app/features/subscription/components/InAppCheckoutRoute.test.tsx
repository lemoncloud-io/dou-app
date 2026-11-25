import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { InAppCheckoutRoute } from './InAppCheckoutRoute';

let mockCheckout: object = { kind: 'web', open: jest.fn() };
const mockLoaded = jest.fn();

jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        get checkout() {
            return mockCheckout;
        },
    })
);
jest.mock('../pages/inAppCheckout/InAppCheckoutPage', () => {
    mockLoaded();
    return { InAppCheckoutPage: () => <p>in-app checkout</p> };
});

const show = () =>
    render(
        <MemoryRouter initialEntries={['/subscription/checkout']}>
            <Routes>
                <Route path="/subscription/checkout" element={<InAppCheckoutRoute />} />
                <Route path="/subscription/plans" element={<p>plans</p>} />
            </Routes>
        </MemoryRouter>
    );

beforeEach(() => mockLoaded.mockClear());

describe('InAppCheckoutRoute', () => {
    it.each([
        ['a store, as the phone app declares', { kind: 'store', store: 'apple' }],
        ['nothing, as the desktop app declares', { kind: 'none' }],
    ])('never loads the checkout chunk where the host sells through %s', async (_name, checkout) => {
        mockCheckout = checkout;
        show();
        expect(await screen.findByText('plans')).toBeInTheDocument();
        expect(mockLoaded).not.toHaveBeenCalled();
    });

    it('loads it where the web sells, a browser tab or a shell that declares the web', async () => {
        mockCheckout = { kind: 'web', open: jest.fn() };
        show();
        expect(await screen.findByText('in-app checkout')).toBeInTheDocument();
        expect(mockLoaded).toHaveBeenCalled();
    });
});
