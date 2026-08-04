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
    it('초대 딥링크는 쿼리를 온전히 달고 루트로 넘긴다 (수락 페이지 판단은 게이트가 한다)', () => {
        // 여기서 /invite/accept 로 질러가면 첫 실행 온보딩 우선순위를 건너뛴다 — 그 판단은
        // InviteEntryGate 한 곳에만 있다.
        mockSearch = '?code=abc&provider=invite&version=2&relay=1';
        render(<LoginPage />);

        expect(forwardedTo()).toBe('/?code=abc&provider=invite&version=2&relay=1');
    });

    it('초대가 아니어도 똑같이 쿼리를 달고 홈으로 넘긴다', () => {
        mockSearch = '?foo=bar';
        render(<LoginPage />);

        expect(forwardedTo()).toBe('/?foo=bar');
    });

    it('쿼리가 없으면 그냥 홈이다', () => {
        mockSearch = '';
        render(<LoginPage />);

        expect(forwardedTo()).toBe('/');
    });
});
