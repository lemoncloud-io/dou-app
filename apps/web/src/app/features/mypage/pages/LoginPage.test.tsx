import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { logger } from '@chatic/bridges';

import { LoginPage } from './LoginPage';

const navigate = jest.fn();
let currentLocation: { state: unknown } = { state: null };

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('react-router-dom', () => ({ useLocation: () => currentLocation }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const loginRelaySocial = jest.fn();
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useLoginRelaySocial: () => ({ mutateAsync: loginRelaySocial, isPending: false }),
        },
    },
}));

// Native so the social buttons render; the browser branch shows only copy.
jest.mock('@chatic/bridges', () => ({
    isNative: () => true,
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

/** What native puts on the `OnOAuthLogin` channel: a credential, a cancel, or a failure. */
type OAuthResultMessage = {
    success: boolean;
    data?: { result: { provider: string } | null };
    error?: { code: string };
};

const startOAuthLogin = jest.fn();
let deliverOAuthResult: ((message: OAuthResultMessage) => void) | null = null;

// The screen fires the request and SUBSCRIBES for the result, so a test plays native by capturing
// the subscriber and calling it — there is no promise to resolve.
jest.mock('../../../bridge', () => ({
    appBridge: { startOAuthLogin: (...a: unknown[]) => startOAuthLogin(...a) },
    useOnOAuthLogin: (handler: (message: OAuthResultMessage) => void) => {
        deliverOAuthResult = handler;
    },
}));

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
    deliverOAuthResult = null;
    loginRelaySocial.mockResolvedValue(undefined);
});

const GOOGLE_CREDENTIAL: OAuthResultMessage = { success: true, data: { result: { provider: 'google' } } };

const tapGoogle = () => fireEvent.click(screen.getByTestId('login-google'));

/** Play the native side answering on the push channel. */
const nativeAnswers = async (message: OAuthResultMessage) => {
    await act(async () => {
        deliverOAuthResult?.(message);
    });
};

/** The whole happy path: tap, then native comes back with a credential. */
const signInWithGoogle = async () => {
    tapGoogle();
    await nativeAnswers(GOOGLE_CREDENTIAL);
};

/**
 * jsdom always reports `history.length === 1`, but the real stack has at least the entry point and
 * the login screen. The guard exists for a shell that recreates its webview and loses the stack
 * while the router state survives, so the two cases are set explicitly here.
 */
const withHistoryLength = (length: number) => jest.spyOn(window.history, 'length', 'get').mockReturnValue(length);

describe('LoginPage — 네이티브 OAuth 결과 수신', () => {
    // This is the regression anchor for this screen. While the request and result were tied to a
    // single round trip, the bridge's default 15s covered that round trip, and if a person took
    // longer than that in the Google UI, the credential already issued arrived as a "response nobody
    // was waiting for" and got discarded — the symptom where Google shows you logged in but the app
    // stays on the login screen.
    it('버튼 탭은 요청만 쏘고 결과를 기다리지 않는다', async () => {
        withHistoryLength(3);
        currentLocation = { state: { returnTo: '/mypage' } };
        render(<LoginPage />);

        tapGoogle();

        expect(startOAuthLogin).toHaveBeenCalledWith('google');
        // Tapping alone does nothing — the result arrives on a separate channel.
        expect(navigate).not.toHaveBeenCalled();

        await nativeAnswers(GOOGLE_CREDENTIAL);

        expect(navigate).toHaveBeenCalledWith(-1);
    });

    it('네이티브가 실패를 보고하면 이동하지 않는다', async () => {
        render(<LoginPage />);

        tapGoogle();
        await nativeAnswers({ success: false, error: { code: 'OAUTH_LOGIN_ERROR' } });

        expect(loginRelaySocial).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });

    it('OAuth가 취소되면(result null) 이동하지 않는다', async () => {
        render(<LoginPage />);

        tapGoogle();
        await nativeAnswers({ success: true, data: { result: null } });

        expect(loginRelaySocial).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });

    it('로그인이 실패하면 이동하지 않는다', async () => {
        loginRelaySocial.mockRejectedValue(new Error('boom'));
        render(<LoginPage />);

        await signInWithGoogle();

        expect(loginRelaySocial).toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });
});

describe('LoginPage — 로그인 후 복귀', () => {
    // The entry point pushed the login screen, so the entry right before it is the screen to return
    // to. Overwriting with replace would leave two consecutive entries for the same route, making the
    // first back tap look like it did nothing.
    it('returnTo가 있으면 히스토리를 한 칸 뒤로 간다', async () => {
        withHistoryLength(3);
        currentLocation = { state: { returnTo: '/subscription/plans' } };
        render(<LoginPage />);

        await signInWithGoogle();

        await waitFor(() => expect(navigate).toHaveBeenCalled());
        expect(navigate).toHaveBeenCalledWith(-1);
    });

    // There is no path at all for the returnTo string to reach the router as a destination — removes
    // the open-redirect surface.
    it('returnTo 문자열을 목적지로 넘기지 않는다', async () => {
        withHistoryLength(3);
        currentLocation = { state: { returnTo: '//evil.example.com' } };
        render(<LoginPage />);

        await signInWithGoogle();

        await waitFor(() => expect(navigate).toHaveBeenCalled());
        expect(navigate).not.toHaveBeenCalledWith('//evil.example.com', expect.anything());
        expect(navigate).toHaveBeenCalledWith(-1);
    });
    // This is the branch a "logged in but landed on home instead of the original screen" report would
    // point to. There are two possible causes (no returnTo / a single history entry) that can't be
    // told apart from the outside, so both inputs are logged alongside the branch taken.
    it('복귀 분기와 그 입력 두 개를 info로 남긴다', async () => {
        withHistoryLength(3);
        currentLocation = { state: { returnTo: '/subscription/plans' } };
        render(<LoginPage />);

        await signInWithGoogle();

        await waitFor(() => expect(navigate).toHaveBeenCalled());
        const info = (logger.info as jest.Mock).mock.calls.find(call => String(call[1]).includes('leaving login'));
        expect(info?.[0]).toBe('AUTH');
        expect(info?.[1]).toContain('back to origin');
        expect(info?.[2]).toEqual({ hadReturnTo: true, historyLength: 3, wentBack: true });
    });

    it('히스토리가 한 칸이면 returnTo가 있어도 폴백으로 기록된다', async () => {
        withHistoryLength(1);
        currentLocation = { state: { returnTo: '/subscription/plans' } };
        render(<LoginPage />);

        await signInWithGoogle();

        await waitFor(() => expect(navigate).toHaveBeenCalled());
        const info = (logger.info as jest.Mock).mock.calls.find(call => String(call[1]).includes('leaving login'));
        expect(info?.[1]).toContain('fallback to home');
        expect(info?.[2]).toEqual({ hadReturnTo: true, historyLength: 1, wentBack: false });
    });

    // The case of landing on the login screen directly via a deep link or a refresh. The default must
    // work quietly.
    it('returnTo가 없으면 홈으로 복귀한다', async () => {
        render(<LoginPage />);

        await signInWithGoogle();

        await waitFor(() => expect(navigate).toHaveBeenCalled());
        expect(navigate).toHaveBeenCalledWith('/', expect.objectContaining({ replace: true }));
    });

    // Only the deep-link fallback specifies a destination. Since replace turns off the transition by
    // default, it's stated explicitly.
    it('홈 폴백은 back 방향 트랜지션을 명시한다', async () => {
        render(<LoginPage />);

        await signInWithGoogle();

        await waitFor(() => expect(navigate).toHaveBeenCalled());
        expect(navigate).toHaveBeenCalledWith('/', { replace: true, transition: true, direction: 'back' });
    });

    // ADR-0055 regression anchor — the old leaveForHome used to rewind history all the way to the
    // start and do a full reload. Both had to go for the user's navigation context and the
    // white-screen problem to be solved together. The case where the shell recreates the webview and
    // the stack is gone but the router state survives — there's nowhere to go back to.
    it('돌아갈 히스토리가 없으면 홈으로 간다', async () => {
        withHistoryLength(1);
        currentLocation = { state: { returnTo: '/mypage' } };
        render(<LoginPage />);

        await signInWithGoogle();

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
        await signInWithGoogle();

        await waitFor(() => expect(navigate).toHaveBeenCalled());
        expect(go).not.toHaveBeenCalled();
        // Only look at the first argument so this doesn't depend on argument count — so it still
        // catches a call like addEventListener('popstate', fn) even if it comes back without options.
        expect(addListener.mock.calls.map(call => call[0])).not.toContain('popstate');

        go.mockRestore();
        addListener.mockRestore();
    });

    it('폰 인증 완료도 같은 복귀 경로를 탄다', () => {
        withHistoryLength(3);
        currentLocation = { state: { returnTo: '/mypage' } };
        render(<LoginPage />);

        fireEvent.click(screen.getByTestId('login-phone')); // The sheet must be open to be mounted
        fireEvent.click(screen.getByTestId('phone-verified'));

        expect(navigate).toHaveBeenCalledWith(-1);
    });
});
