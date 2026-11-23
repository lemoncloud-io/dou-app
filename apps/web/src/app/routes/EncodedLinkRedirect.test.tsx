import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { logger } from '@chatic/bridges';

import { EncodedLinkRedirect } from './EncodedLinkRedirect';
import { ROUTES } from './paths';

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
                <Route path="/i" element={<EncodedLinkRedirect />} />
            </Routes>
        </MemoryRouter>
    );
    await waitFor(() => expect(screen.queryByTestId('landed')).not.toBeNull());
    const landed = screen.getByTestId('landed');
    return {
        pathname: landed.getAttribute('data-pathname'),
        params: new URLSearchParams(landed.textContent ?? ''),
    };
};

const token = (payload: Record<string, unknown>): string => Buffer.from(JSON.stringify(payload)).toString('base64url');

const CODE = 'invt:1000072-2:e3faf0d0';

describe('EncodedLinkRedirect — /i 인코딩 초대 링크 리다이렉트', () => {
    it('{c,a,s}는 좌표를 _backend로 펼쳐 초대 진입으로 보낸다', async () => {
        const { pathname, params } = await landOn(`/i?t=${token({ c: CODE, a: 'uzjpiaey7a', s: 'dev' })}`);

        expect(pathname).toBe(ROUTES.root);
        expect(params.get('code')).toBe(CODE);
        expect(params.get('provider')).toBe('invite');
        expect(params.get('version')).toBe('2');
        expect(params.get('_backend')).toBe('https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev');
        expect(params.has('relay')).toBe(false);
    });

    it('{c,r:1}은 relay=1로 보내고 주소를 붙이지 않는다', async () => {
        const { pathname, params } = await landOn(`/i?t=${token({ c: CODE, r: 1 })}`);

        expect(pathname).toBe(ROUTES.root);
        expect(params.get('code')).toBe(CODE);
        expect(params.get('relay')).toBe('1');
        expect(params.has('_backend')).toBe(false);
    });

    it('r이 truthy면 좌표가 함께 와도 relay다', async () => {
        const { params } = await landOn(`/i?t=${token({ c: CODE, r: 1, a: 'uzjpiaey7a', s: 'dev' })}`);

        expect(params.get('relay')).toBe('1');
        expect(params.has('_backend')).toBe(false);
    });

    it('t 밖의 파라미터는 그대로 전달한다', async () => {
        const { params } = await landOn(`/i?t=${token({ c: CODE, r: 1 })}&utm_source=kakao`);

        expect(params.get('utm_source')).toBe('kakao');
        expect(params.has('t')).toBe(false);
    });

    it.each([
        ['t가 없는 /i', '/i'],
        ['풀 수 없는 t', '/i?t=!!!not-base64!!!'],
        ['code 없는 payload', `/i?t=${token({ a: 'uzjpiaey7a', s: 'dev' })}`],
    ])('%s는 파라미터 없이 루트로 보낸다', async (_label, initialPath) => {
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        const { pathname, params } = await landOn(initialPath);

        expect(pathname).toBe(ROUTES.root);
        expect(params.toString()).toBe('');
    });

    it('opens a link with Korean text glued onto its token', async () => {
        const { pathname, params } = await landOn(`/i?t=${token({ c: CODE, r: 1 })}입니다`);

        expect(pathname).toBe(ROUTES.root);
        expect(params.get('code')).toBe(CODE);
        expect(params.get('relay')).toBe('1');
    });

    it('logs the shape of a refused token, never the query that carries it', async () => {
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
        const truncated = token({ c: CODE, r: 1 }).slice(0, -4);

        await landOn(`/i?t=${truncated}`);

        expect(warn).toHaveBeenCalledWith('DEEPLINK', expect.stringContaining('unreadable encoded invite link'), {
            error: expect.any(Error),
            failedAt: 'json',
            length: truncated.length,
            ignoredChars: 0,
        });
        expect(JSON.stringify(warn.mock.calls)).not.toContain(truncated.slice(0, 10));
    });

    it.todo('좌표 없는 {c}가 어디로 가야 하는지 — 폴백 결정 대기 중');
});
