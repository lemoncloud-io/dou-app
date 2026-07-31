import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { LoginPage } from './LoginPage';

// Mutable per-test fixture (must be `mock`-prefixed to be usable inside jest.mock factories).
let mockSearch = '';

jest.mock('react-router-dom', () => ({
    useLocation: () => ({ search: mockSearch }),
    Navigate: ({ to }: { to: string }) => <div>navigated:{to}</div>,
}));

const forwardedTo = () => screen.getByText(/^navigated:/).textContent?.replace('navigated:', '');

describe('LoginPage — 배포된 딥링크 호환 심', () => {
    it('초대 딥링크는 수락 페이지로 넘긴다', () => {
        mockSearch = '?code=abc&provider=invite&version=2&relay=1';
        render(<LoginPage />);

        expect(forwardedTo()).toBe('/invite/accept?code=abc&provider=invite&version=2&relay=1');
    });

    it('클라우드 폼도 동일하게 넘긴다', () => {
        mockSearch = '?code=abc&provider=invite&version=2&_backend=https%3A%2F%2Fapi';
        render(<LoginPage />);

        expect(forwardedTo()).toBe('/invite/accept?code=abc&provider=invite&version=2&_backend=https%3A%2F%2Fapi');
    });

    it('초대가 아니면 쿼리를 그대로 달고 홈으로 넘긴다', () => {
        mockSearch = '?foo=bar';
        render(<LoginPage />);

        expect(forwardedTo()).toBe('/?foo=bar');
    });

    it('쿼리가 없으면 그냥 홈이다', () => {
        mockSearch = '';
        render(<LoginPage />);

        expect(forwardedTo()).toBe('/');
    });

    it('반쪽짜리 초대 링크는 수락 페이지로 보내지 않는다 (보여줄 초대가 없다)', () => {
        // provider 마커는 있지만 수락할 대상(_backend / relay)이 없다.
        mockSearch = '?code=abc&provider=invite&version=2';
        render(<LoginPage />);

        expect(forwardedTo()).toBe('/?code=abc&provider=invite&version=2');
    });
});
