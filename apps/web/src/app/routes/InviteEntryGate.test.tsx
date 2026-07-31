import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { InviteEntryGate } from './InviteEntryGate';

// Mutable per-test fixture (must be `mock`-prefixed to be usable inside jest.mock factories).
let mockIsFirstRun = false;

// The real store reads localStorage through a PREFERENCES key map; only `isFirstRun` matters here.
jest.mock('../stores/usePreferenceStore', () => ({
    usePreferenceStore: (selector: (state: { isFirstRun: boolean }) => unknown) =>
        selector({ isFirstRun: mockIsFirstRun }),
}));

// MemoryRouter, not createMemoryRouter: a data router needs the `Request` global to follow a
// <Navigate>, and jsdom has none (see the note in PublicRoutes.test.tsx).
const Landed = ({ name }: { name: string }) => {
    const { pathname, search } = useLocation();
    return <span data-testid={name}>{`${pathname}${search}`}</span>;
};

const landOn = async (initialPath: string) => {
    render(
        <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
                <Route
                    path="/"
                    element={
                        <InviteEntryGate>
                            <Landed name="home" />
                        </InviteEntryGate>
                    }
                />
                <Route path="/invite/accept" element={<Landed name="accept" />} />
            </Routes>
        </MemoryRouter>
    );
    // jest-dom matchers are not wired up in this project, so assert on the query result directly.
    await waitFor(() => expect(screen.queryByTestId('home') ?? screen.queryByTestId('accept')).not.toBeNull());
};

const RELAY_INVITE = '/?provider=invite&code=abc&relay=1';

beforeEach(() => {
    mockIsFirstRun = false;
});

describe('InviteEntryGate — 루트에 도착한 초대 링크', () => {
    it('초대 진입이면 홈을 렌더하지 않고 수락 페이지로 보낸다', async () => {
        await landOn(RELAY_INVITE);

        expect(screen.queryByTestId('home')).toBeNull();
        expect(screen.getByTestId('accept').textContent).toBe('/invite/accept?provider=invite&code=abc&relay=1');
    });

    it('초대가 아니면 children(홈)을 그대로 렌더한다', async () => {
        await landOn('/?foo=bar');

        expect(screen.getByTestId('home').textContent).toBe('/?foo=bar');
        expect(screen.queryByTestId('accept')).toBeNull();
    });

    it('쿼리가 없는 평범한 홈 진입도 그대로 통과시킨다', async () => {
        await landOn('/');

        expect(screen.getByTestId('home').textContent).toBe('/');
    });

    it('첫 실행이면 초대여도 보류한다 — 온보딩이 먼저다', async () => {
        mockIsFirstRun = true;
        await landOn(RELAY_INVITE);

        expect(screen.queryByTestId('accept')).toBeNull();
        // The query string must survive the hold, or completing onboarding would lose the invite.
        expect(screen.getByTestId('home').textContent).toBe(RELAY_INVITE);
    });

    it('온보딩이 끝나면 같은 URL에서 수락 페이지로 넘어간다', async () => {
        mockIsFirstRun = true;
        const { rerender } = render(
            <MemoryRouter initialEntries={[RELAY_INVITE]}>
                <Routes>
                    <Route
                        path="/"
                        element={
                            <InviteEntryGate>
                                <Landed name="home" />
                            </InviteEntryGate>
                        }
                    />
                    <Route path="/invite/accept" element={<Landed name="accept" />} />
                </Routes>
            </MemoryRouter>
        );
        await waitFor(() => expect(screen.queryByTestId('home')).not.toBeNull());

        // completeOnboarding() flips the flag; the gate re-renders and the invite proceeds.
        mockIsFirstRun = false;
        rerender(
            <MemoryRouter initialEntries={[RELAY_INVITE]}>
                <Routes>
                    <Route
                        path="/"
                        element={
                            <InviteEntryGate>
                                <Landed name="home" />
                            </InviteEntryGate>
                        }
                    />
                    <Route path="/invite/accept" element={<Landed name="accept" />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => expect(screen.queryByTestId('accept')).not.toBeNull());
    });
});
