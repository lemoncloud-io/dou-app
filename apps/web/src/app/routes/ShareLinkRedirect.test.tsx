import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { ShareLinkRedirect } from './ShareLinkRedirect';
import { ROUTES } from './paths';

// Two deliberate choices here:
// - Mounted directly, not via `commonRoutes`: importing that barrel pulls in AuthRoutes and the whole
//   auth feature tree, which this jest config cannot resolve. The wiring is a one-line entry in
//   CommonRoutes.tsx; the conversion + redirect behaviour is what matters.
// - MemoryRouter, not createMemoryRouter: a data router needs the `Request` global, absent in this
//   jsdom env (see the note in PublicRoutes.test.tsx). <Navigate> works the same on either.
const LandedAt = () => {
    const { pathname, search } = useLocation();
    return (
        <span data-testid="landed" data-pathname={pathname}>
            {search}
        </span>
    );
};

const landOn = async (initialPath: string) => {
    render(
        <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
                <Route path={ROUTES.root} element={<LandedAt />} />
                <Route path={ROUTES.invite.accept} element={<LandedAt />} />
                <Route path="/s" element={<ShareLinkRedirect />} />
            </Routes>
        </MemoryRouter>
    );
    // jest-dom matchers are not wired up in this project, so assert on the query result directly.
    await waitFor(() => expect(screen.queryByTestId('landed')).not.toBeNull());
    const landed = screen.getByTestId('landed');
    return {
        pathname: landed.getAttribute('data-pathname'),
        params: new URLSearchParams(landed.textContent ?? ''),
    };
};

describe('ShareLinkRedirect — /s 공유 링크 리다이렉트', () => {
    it('주소 파라미터가 없는 code-only 릴레이 링크를 relay=1 초대 진입으로 바꿔 보낸다', async () => {
        // This is the link an un-updated mobile WebView hands over verbatim; without this route it
        // hits the router's '*' fallback and the whole query string is dropped.
        const { pathname, params } = await landOn('/s?code=invt%3A1000072-2%3Ae3faf0d0');

        expect(pathname).toBe(ROUTES.invite.accept);
        expect(params.get('code')).toBe('invt:1000072-2:e3faf0d0');
        expect(params.get('provider')).toBe('invite');
        expect(params.get('version')).toBe('2');
        expect(params.get('relay')).toBe('1');
        expect(params.has('_backend')).toBe(false);
    });

    it('relay 플래그가 붙은 링크도 동일하게 처리한다', async () => {
        const { pathname, params } = await landOn('/s?code=c&relay');

        expect(pathname).toBe(ROUTES.invite.accept);
        expect(params.get('relay')).toBe('1');
        expect(params.has('_backend')).toBe(false);
    });

    it('클라우드 폼은 _backend를 조립해 보낸다', async () => {
        const { pathname, params } = await landOn('/s?code=c&api=uzjpiaey7a&stage=dev');

        expect(pathname).toBe(ROUTES.invite.accept);
        expect(params.get('_backend')).toBe('https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev');
        expect(params.has('relay')).toBe(false);
    });

    it('변환할 수 없는 링크는 수락 페이지가 아니라 파라미터 없이 루트로 보낸다', async () => {
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        const { pathname, params } = await landOn('/s?nonsense=1');

        expect(pathname).toBe(ROUTES.root);
        expect(params.toString()).toBe('');
    });
});
