import { matchRoutes } from 'react-router-dom';

import { ROUTES } from './paths';

const routes = [
    {
        path: '/',
        children: [{ index: true }, { path: 'invite/*' }, { path: 'channels/*' }],
    },
    { path: ROUTES.invite.accept },
];

const matchedPath = (pathname: string) => {
    const matches = matchRoutes(routes, pathname);
    return matches?.[matches.length - 1]?.route.path;
};

describe('/invite/accept 라우트 랭킹', () => {
    it('발신 플로우의 invite/* 스플랫보다 우선한다', () => {
        expect(matchedPath('/invite/accept')).toBe(ROUTES.invite.accept);
    });

    it('쿼리스트링이 붙어도 마찬가지다 (실제 진입 형태)', () => {
        expect(matchedPath(new URL(`https://x${ROUTES.invite.accept}?code=abc&relay=1`).pathname)).toBe(
            ROUTES.invite.accept
        );
    });

    it('다른 invite 하위 경로는 여전히 발신 스플랫이 받는다', () => {
        expect(matchedPath('/invite/contact')).toBe('invite/*');
        expect(matchedPath('/invite/inv-1/waiting')).toBe('invite/*');
    });
});
