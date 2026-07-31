import { matchRoutes } from 'react-router-dom';

import { ROUTES } from './paths';

/**
 * Mirrors the *shape* of the real route sets, not their elements: importing `commonRoutes` or
 * `privateRoutes` pulls in whole feature trees this jest config cannot resolve. Keep in sync with
 * CommonRoutes.tsx and PrivateRoutes.tsx if either path changes.
 */
const routes = [
    // privateRoutes: one parent at '/' whose children include the sender flow's splat.
    {
        path: '/',
        children: [{ index: true }, { path: 'invite/*' }, { path: 'channels/*' }],
    },
    // commonRoutes: the accept page, appended after the private set.
    { path: ROUTES.invite.accept },
];

const matchedPath = (pathname: string) => {
    const matches = matchRoutes(routes, pathname);
    return matches?.[matches.length - 1]?.route.path;
};

describe('/invite/accept 라우트 랭킹', () => {
    it('발신 플로우의 invite/* 스플랫보다 우선한다', () => {
        // react-router ranks by score (static segment +10, splat -2), NOT by array order — even
        // though `invite/*` is registered first. If a router upgrade or a path change ever flips
        // this, the sender routes swallow the accept screen and the invite vanishes silently.
        expect(matchedPath('/invite/accept')).toBe(ROUTES.invite.accept);
    });

    it('쿼리스트링이 붙어도 마찬가지다 (실제 진입 형태)', () => {
        // matchRoutes matches on pathname only, but assert it explicitly: every real arrival at this
        // route carries the invite params.
        expect(matchedPath(new URL(`https://x${ROUTES.invite.accept}?code=abc&relay=1`).pathname)).toBe(
            ROUTES.invite.accept
        );
    });

    it('다른 invite 하위 경로는 여전히 발신 스플랫이 받는다', () => {
        expect(matchedPath('/invite/contact')).toBe('invite/*');
        expect(matchedPath('/invite/inv-1/waiting')).toBe('invite/*');
    });
});
