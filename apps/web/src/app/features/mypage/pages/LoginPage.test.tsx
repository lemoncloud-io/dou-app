import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { LoginPage } from './LoginPage';

const navigate = jest.fn();
let currentLocation: { state: unknown } = { state: null };

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('react-router-dom', () => ({ useLocation: () => currentLocation }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const loginRelaySocial = jest.fn();
jest.mock('@chatic/web-core', () => ({
    useLoginRelaySocial: () => ({ mutateAsync: loginRelaySocial, isPending: false }),
}));

// Native so the social buttons render; the browser branch shows only copy.
jest.mock('@chatic/bridges', () => ({ isNative: () => true, logger: { error: jest.fn() } }));

const oauthLogin = jest.fn();
jest.mock('../../../bridge', () => ({ appBridge: { oauthLogin: (...a: unknown[]) => oauthLogin(...a) } }));

// Phone login is dev-only; keeping it visible lets the onVerified path be exercised here.
jest.mock('../../../utils/buildEnv', () => ({ isDevBuild: () => true }));
jest.mock('../../../ui/components', () => ({ PageHeader: () => null }));
jest.mock('../components', () => ({ AppleIcon: () => null, GoogleIcon: () => null }));

// Expose onVerified as a button so the phone path can be driven without the real sheet.
jest.mock('../../auth/components/PhoneVerifySheet', () => ({
    PhoneVerifySheet: ({ onVerified }: { onVerified: () => void }) => (
        <button data-testid="phone-verified" onClick={onVerified} />
    ),
}));

beforeEach(() => {
    jest.clearAllMocks();
    currentLocation = { state: null };
    oauthLogin.mockResolvedValue({ data: { result: { provider: 'google' } } });
    loginRelaySocial.mockResolvedValue(undefined);
});

const signInWithGoogle = () => fireEvent.click(screen.getByTestId('login-google'));

/**
 * jsdom always reports `history.length === 1`, but the real stack has at least the entry point and
 * the login screen. The guard exists for a shell that recreates its webview and loses the stack
 * while the router state survives, so the two cases are set explicitly here.
 */
const withHistoryLength = (length: number) => jest.spyOn(window.history, 'length', 'get').mockReturnValue(length);

describe('LoginPage — 로그인 후 복귀', () => {
    // 진입점이 로그인 화면을 push했으므로 직전 항목이 곧 돌아갈 화면이다. replace로 덮으면 같은
    // 경로가 연속 두 개가 되어 첫 뒤로가기가 아무 일도 안 한 것처럼 보인다.
    it('returnTo가 있으면 히스토리를 한 칸 뒤로 간다', async () => {
        withHistoryLength(3);
        currentLocation = { state: { returnTo: '/subscription/plans' } };
        render(<LoginPage />);

        signInWithGoogle();

        await waitFor(() => expect(navigate).toHaveBeenCalled());
        expect(navigate).toHaveBeenCalledWith(-1);
    });

    // returnTo 문자열이 라우터에 목적지로 넘어가는 경로가 아예 없다 — 오픈 리다이렉트 표면 제거.
    it('returnTo 문자열을 목적지로 넘기지 않는다', async () => {
        withHistoryLength(3);
        currentLocation = { state: { returnTo: '//evil.example.com' } };
        render(<LoginPage />);

        signInWithGoogle();

        await waitFor(() => expect(navigate).toHaveBeenCalled());
        expect(navigate).not.toHaveBeenCalledWith('//evil.example.com', expect.anything());
        expect(navigate).toHaveBeenCalledWith(-1);
    });
    // 딥링크·새로고침으로 로그인 화면에 직접 도달한 경우. 기본값이 조용히 동작해야 한다.
    it('returnTo가 없으면 홈으로 복귀한다', async () => {
        render(<LoginPage />);

        signInWithGoogle();

        await waitFor(() => expect(navigate).toHaveBeenCalled());
        expect(navigate).toHaveBeenCalledWith('/', expect.objectContaining({ replace: true }));
    });

    // 딥링크 폴백만 목적지를 지정한다. replace가 걸리면 트랜지션이 기본으로 꺼지므로 명시한다.
    it('홈 폴백은 back 방향 트랜지션을 명시한다', async () => {
        render(<LoginPage />);

        signInWithGoogle();

        await waitFor(() => expect(navigate).toHaveBeenCalled());
        expect(navigate).toHaveBeenCalledWith('/', { replace: true, transition: true, direction: 'back' });
    });

    // ADR-0055 회귀 고정 — 예전 leaveForHome은 히스토리를 처음까지 되감고 풀 리로드를 했다.
    // 둘 다 사라져야 사용자의 내비게이션 맥락과 흰 화면 문제가 함께 해결된다.
    // 셸이 웹뷰를 새로 만들어 스택이 사라졌는데 라우터 state만 남은 경우 — 뒤로 갈 곳이 없다.
    it('돌아갈 히스토리가 없으면 홈으로 간다', async () => {
        withHistoryLength(1);
        currentLocation = { state: { returnTo: '/mypage' } };
        render(<LoginPage />);

        signInWithGoogle();

        await waitFor(() => expect(navigate).toHaveBeenCalled());
        expect(navigate).toHaveBeenCalledWith('/', expect.objectContaining({ replace: true }));
    });

    it('히스토리를 되감거나 풀 리로드하지 않는다', async () => {
        withHistoryLength(3);
        // jsdom's window.location is non-configurable, so the reload is caught via the listener the
        // old implementation registered to fire it — no popstate handler means no pending reload.
        const go = jest.spyOn(window.history, 'go').mockImplementation(() => undefined);
        const addListener = jest.spyOn(window, 'addEventListener');

        currentLocation = { state: { returnTo: '/mypage' } };
        render(<LoginPage />);
        signInWithGoogle();

        await waitFor(() => expect(navigate).toHaveBeenCalled());
        expect(go).not.toHaveBeenCalled();
        // 인자 개수에 의존하지 않게 첫 인자만 본다 — addEventListener('popstate', fn)처럼 옵션 없이
        // 되살아나도 잡히도록.
        expect(addListener.mock.calls.map(call => call[0])).not.toContain('popstate');

        go.mockRestore();
        addListener.mockRestore();
    });

    it('폰 인증 완료도 같은 복귀 경로를 탄다', () => {
        withHistoryLength(3);
        currentLocation = { state: { returnTo: '/mypage' } };
        render(<LoginPage />);

        fireEvent.click(screen.getByTestId('login-phone')); // 시트는 열어야 마운트된다
        fireEvent.click(screen.getByTestId('phone-verified'));

        expect(navigate).toHaveBeenCalledWith(-1);
    });

    it('OAuth가 취소되면(result null) 이동하지 않는다', async () => {
        oauthLogin.mockResolvedValue({ data: { result: null } });
        render(<LoginPage />);

        signInWithGoogle();

        await waitFor(() => expect(oauthLogin).toHaveBeenCalled());
        expect(navigate).not.toHaveBeenCalled();
    });

    it('로그인이 실패하면 이동하지 않는다', async () => {
        loginRelaySocial.mockRejectedValue(new Error('boom'));
        render(<LoginPage />);

        signInWithGoogle();

        await waitFor(() => expect(loginRelaySocial).toHaveBeenCalled());
        expect(navigate).not.toHaveBeenCalled();
    });
});
