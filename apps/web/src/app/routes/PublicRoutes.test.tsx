import { render, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

import { publicRoutes } from './PublicRoutes';

// The root entry is now InviteEntryGate, which reads `isFirstRun`. Stubbing the store keeps this
// suite about routing: the real one reaches the bridge barrel, and through it web-core's
// `import.meta`, which ts-jest cannot parse. InviteEntryGate.test.tsx covers the gate's own logic.
jest.mock('../stores/usePreferenceStore', () => ({
    usePreferenceStore: (selector: (state: { isFirstRun: boolean }) => unknown) => selector({ isFirstRun: false }),
}));

// Build a standalone memory router over the unauthenticated route set.
const makeRouter = (initialPath: string) => createMemoryRouter(publicRoutes, { initialEntries: [initialPath] });

describe('publicRoutes — 비로그인 라우팅', () => {
    it("'/' 진입은 /auth/login으로 보내지 않고 '/'에서 대기한다 (무한 리다이렉트 루프 방지)", async () => {
        const router = makeRouter('/');
        render(<RouterProvider router={router} />);

        // Holds on root; if it redirected to /auth/login (which forwards back to '/'), this loops.
        await waitFor(() => expect(router.state.location.pathname).toBe('/'));
        expect(router.state.location.pathname).not.toBe('/auth/login');
    });

    it("'/' 진입 시 invite 쿼리스트링을 보존한다 (인증 후 home이 사용)", async () => {
        const router = makeRouter('/?provider=invite&code=abc');
        render(<RouterProvider router={router} />);

        await waitFor(() => expect(router.state.location.pathname).toBe('/'));
        expect(router.state.location.search).toBe('?provider=invite&code=abc');
    });

    // NOTE: the '*' catch-all (Navigate to root) is verified by review, not here — exercising a
    // data-router redirect needs the `Request` global, which is absent in the jsdom test env.
});
