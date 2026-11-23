import { render, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

import { publicRoutes } from './PublicRoutes';

const mockReleaseHold = jest.fn();
const mockUseBootSplashHold = jest.fn();
jest.mock('../runtime/bootSplash', () => {
    const { useLayoutEffect } = jest.requireActual('react');
    return {
        useBootSplashHold: () => {
            mockUseBootSplashHold();
            useLayoutEffect(() => mockReleaseHold, []);
        },
    };
});

jest.mock('../hooks', () => ({
    useOnboarding: () => ({ isFirstRun: false, completeOnboarding: jest.fn(), resetOnboarding: jest.fn() }),
}));

const makeRouter = (initialPath: string) => createMemoryRouter(publicRoutes, { initialEntries: [initialPath] });

describe('publicRoutes — 비로그인 라우팅', () => {
    it("'/' 진입은 /auth/login으로 보내지 않고 '/'에서 대기한다 (무한 리다이렉트 루프 방지)", async () => {
        const router = makeRouter('/');
        render(<RouterProvider router={router} />);

        await waitFor(() => expect(router.state.location.pathname).toBe('/'));
        expect(router.state.location.pathname).not.toBe('/auth/login');
    });

    it("'/' 진입 시 invite 쿼리스트링을 보존한다 (인증 후 home이 사용)", async () => {
        const router = makeRouter('/?provider=invite&code=abc');
        render(<RouterProvider router={router} />);

        await waitFor(() => expect(router.state.location.pathname).toBe('/'));
        expect(router.state.location.search).toBe('?provider=invite&code=abc');
    });

    it('holds the boot cover while the signed-out root waits, and lets go when it unmounts', async () => {
        mockUseBootSplashHold.mockClear();
        mockReleaseHold.mockClear();
        const router = makeRouter('/');
        const { unmount } = render(<RouterProvider router={router} />);

        await waitFor(() => expect(mockUseBootSplashHold).toHaveBeenCalled());
        expect(mockReleaseHold).not.toHaveBeenCalled();

        unmount();
        expect(mockReleaseHold).toHaveBeenCalled();
    });
});
