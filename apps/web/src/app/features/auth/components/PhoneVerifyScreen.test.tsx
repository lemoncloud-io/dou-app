import '@testing-library/jest-dom';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockSend = jest.fn();
const mockVerify = jest.fn();
const mockConfirm = jest.fn();
const mockApplySessionToken = jest.fn();
const mockToast = jest.fn();
const mockNavigate = jest.fn();
/** Whether this user already proved a social account. `'unknown'` is the pre-profile default. */
let mockLinkedSocial: 'linked' | 'absent' | 'unknown' = 'unknown';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }),
}));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => mockNavigate }));
// The banner's useNavigateToLogin reads the current location to remember where to come back to;
// this screen renders outside a Router here, so stand it in rather than wrap every case.
jest.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/invite/accept', search: '', hash: '' }) }));
jest.mock('@chatic/app-runtime', () => ({
    applySessionToken: (...args: unknown[]) => mockApplySessionToken(...args),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
// Radix overlays are stubbed as pass-through markup (house convention — see AddFriendSheet.test).
// `DialogContent` keeps `className` and `role` rather than dropping them: the real one merges the
// variant classes with the caller's, and the layout constraints this shell depends on (see the
// 좁은 화면·키보드 suite) live in exactly that string — a stub that swallowed it would let them be
// deleted with every test still green.
jest.mock('@chatic/ui-kit/components/ui/dialog', () => ({
    Dialog: ({ open, children }: any) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children, className }: any) => (
        <div role="dialog" className={className}>
            {children}
        </div>
    ),
    DialogTitle: ({ children }: any) => <div>{children}</div>,
    DialogDescription: ({ children }: any) => <div>{children}</div>,
}));
// One packet (`auth.link-account`) behind four calls; the two social ones are unused by this shell.
jest.mock('../../../hooks/useLinkAccount', () => ({
    useLinkAccount: () => ({
        send: mockSend,
        verify: mockVerify,
        confirm: mockConfirm,
        verifySocial: jest.fn(),
        confirmSocial: jest.fn(),
        isSending: false,
        isVerifying: false,
        isConfirming: false,
        isLinkingSocial: false,
    }),
}));
jest.mock('../../../utils/buildEnv', () => ({ isDevBuild: jest.fn(() => false) }));
// The banner reads this to decide whether the account-split warning still applies. Mocked at the
// concrete module because the real one reaches useMyUser -> web-core, whose transport reads
// `import.meta` and cannot load under jsdom.
jest.mock('../../../hooks/useLinkedAccounts', () => ({
    useLinkedAccounts: () => ({ phone: 'unknown', social: mockLinkedSocial }),
}));

import { isDevBuild } from '../../../utils/buildEnv';
import { PhoneVerifyScreen } from './PhoneVerifyScreen';

const PHONE = '01012345678';
// What the field displays and what the packet actually carries now differ (ADR-0044 §5 correction —
// the wire wants E.164, not the local form the field shows).
const PHONE_E164 = '+821012345678';
const FUTURE_EXPIRY = () => Date.now() + 180_000;

/**
 * jsdom reports `navigator.language` as `en-US`, which would open these screens on US and reject
 * every Korean number here. Seeding the remembered pick uses the production "last explicit pick
 * wins" path rather than stubbing around it (ADR-0044 §4).
 */
const seedCountry = (code = 'KR') => {
    localStorage.clear();
    localStorage.setItem('dou.phoneInput.country.v1', code);
};

const setLanguage = (value: string) => {
    Object.defineProperty(window.navigator, 'language', { value, configurable: true });
};

/** Opens the country sheet and taps a row by its localized name. */
const pickCountry = (name: string) => {
    fireEvent.click(screen.getByLabelText('phoneInput.countrySheetTitle'));
    fireEvent.click(screen.getByText(name));
};

const renderScreen = (overrides: Partial<React.ComponentProps<typeof PhoneVerifyScreen>> = {}) => {
    const props = {
        context: 'invite-accept' as const,
        // The accept flow always proves a number to OPEN a session (ADR-0042 §3).
        mode: 'login' as const,
        inviteCode: 'invt:i1:code',
        onVerified: jest.fn(),
        onClose: jest.fn(),
        ...overrides,
    };
    render(<PhoneVerifyScreen {...props} />);
    return props;
};

const typePhone = (digits = PHONE) => {
    fireEvent.change(screen.getByPlaceholderText('phoneVerify.phonePlaceholder'), { target: { value: digits } });
};

const submitSend = async () => {
    await act(async () => {
        fireEvent.click(screen.getByText('phoneVerify.sendCode'));
    });
};

/** Requests a code successfully, which arms the code field on the same screen. */
const requestCode = async (overrides: Partial<React.ComponentProps<typeof PhoneVerifyScreen>> = {}) => {
    mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
    const props = renderScreen(overrides);
    typePhone();
    await submitSend();
    return props;
};

/** Enters a full 6-digit code, which auto-submits the mode's prove step. */
const pasteOtp = async (code = '123456') => {
    await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('phoneVerify.codePlaceholder'), { target: { value: code } });
    });
};

/** Taps the pinned CTA (완료 / 다시 시도). */
const submitCta = async () => {
    await act(async () => {
        fireEvent.click(screen.getByText('phoneVerify.complete'));
    });
};

describe('PhoneVerifyScreen — 인증 요청', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seedCountry();
        mockLinkedSocial = 'unknown';
        (isDevBuild as jest.Mock).mockReturnValue(false);
    });

    it('유효한 휴대폰 번호가 아니면 발송 버튼이 비활성이다', () => {
        renderScreen();
        const button = screen.getByText('phoneVerify.sendCode').closest('button');
        expect(button).toBeDisabled();

        typePhone('02012345678');
        expect(button).toBeDisabled();

        typePhone(PHONE);
        expect(button).toBeEnabled();
    });

    it('발송 성공 시 mode와 초대 코드를 동봉하고 인증번호 입력이 열린다', async () => {
        await requestCode();

        expect(mockSend).toHaveBeenCalledWith(PHONE_E164, {
            mode: 'login',
            code: 'invt:i1:code',
            countryCode: 'KR',
        });
        expect(screen.getByPlaceholderText('phoneVerify.codePlaceholder')).toBeEnabled();
        expect(mockToast).toHaveBeenCalledWith({ title: 'phoneVerify.sent' });
    });

    it('초대받은 번호의 끝 4자리와 다르면 발송 자체를 하지 않는다 (ADR-0042 §8 사전 차단)', async () => {
        renderScreen({ inviteLast4: '9999' });
        typePhone(PHONE);
        await submitSend();

        expect(screen.getByText('phoneVerify.inviteMismatch')).toBeInTheDocument();
        // The cheap check spends no delivery against the daily caps.
        expect(mockSend).not.toHaveBeenCalled();
        expect(screen.getByPlaceholderText('phoneVerify.codePlaceholder')).toBeDisabled();

        // 끝 4자리가 맞으면 그대로 통과한다 — 4자리는 판정이 아니라 선차단일 뿐이다.
        mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
        typePhone('01012349999');
        await submitSend();

        expect(mockSend).toHaveBeenCalledWith('+821012349999', {
            mode: 'login',
            code: 'invt:i1:code',
            countryCode: 'KR',
        });
    });

    it('초대 맥락의 발송 400은 "초대받은 번호가 아니에요"로 안내한다 (§B-2 발송단 차단)', async () => {
        mockSend.mockRejectedValueOnce(new Error('400 BAD REQUEST - phone does not match the invite'));
        renderScreen();
        typePhone();
        await submitSend();

        expect(screen.getByText('phoneVerify.inviteMismatch')).toBeInTheDocument();
        // No code went out, so the code field stays locked.
        expect(screen.getByPlaceholderText('phoneVerify.codePlaceholder')).toBeDisabled();
    });

    it('발송 429는 요청 과다(일일 상한)로 안내한다', async () => {
        mockSend.mockRejectedValueOnce(new Error('429 TOO MANY REQUESTS - daily cap'));
        renderScreen();
        typePhone();
        await submitSend();

        expect(screen.getByText('phoneVerify.tooManyRequests')).toBeInTheDocument();
    });

    it('배너를 누르면 화면을 닫고 소셜 로그인 페이지로 보낸다 (계정 갈라짐 방어)', () => {
        const { onClose } = renderScreen();
        fireEvent.click(screen.getByText('phoneVerify.socialFirstTitle'));

        expect(onClose).toHaveBeenCalled();
        // returnTo is the screen the banner was shown on, so finishing social sign-in comes back
        // here rather than dumping the user on home mid-flow (ADR-0055).
        expect(mockNavigate).toHaveBeenCalledWith('/mypage/login', { state: { returnTo: '/invite/accept' } });
    });

    // The banner tells a user with an existing social account to log in with it FIRST, or they will
    // mint a second, unmergeable user. Someone who already linked social cannot land in that state,
    // so the notice is not just noise — it points them back through a login they have done.
    it('소셜이 이미 연결돼 있으면 배너를 띄우지 않는다', () => {
        mockLinkedSocial = 'linked';
        renderScreen();

        expect(screen.queryByText('phoneVerify.socialFirstTitle')).not.toBeInTheDocument();
    });

    // Only a definite `linked` hides it. `unknown` means the profile has not landed or the server
    // never built the `link$` slot — and this is the one defense against an unmergeable account, so
    // the safe failure is showing it to someone who did not need it (ADR-0042 §5).
    it.each(['absent', 'unknown'] as const)('social이 %s면 배너는 그대로 뜬다', social => {
        mockLinkedSocial = social;
        renderScreen();

        expect(screen.getByText('phoneVerify.socialFirstTitle')).toBeInTheDocument();
    });

    // Deliberately mode-independent. `link` mode can still hit `occupied` (the number belongs to a
    // separate phone-created user), and this banner is the guide's only documented defense for a
    // split account (§제약) — hiding it there would remove the one signpost out.
    it('link 모드에서도 배너는 그대로 뜬다 — 분리 계정 안내는 모드와 무관하다', () => {
        renderScreen({ mode: 'link' });

        expect(screen.getByText('phoneVerify.socialFirstTitle')).toBeInTheDocument();
    });

    it('dev 빌드에서만 발송 스위치가 보이고, Slack 토글은 {slack:true, sms:false}로 실린다', async () => {
        (isDevBuild as jest.Mock).mockReturnValue(true);
        mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
        renderScreen();

        fireEvent.click(screen.getByLabelText('phoneVerify.devSlack'));
        typePhone();
        await submitSend();

        expect(mockSend).toHaveBeenCalledWith(PHONE_E164, {
            mode: 'login',
            code: 'invt:i1:code',
            countryCode: 'KR',
            slack: true,
            sms: false,
        });
    });

    // 서버가 개발 환경에서 '#'을 인정한다. 클라이언트가 건너뛰는 게 아니라 평소와 같은
    // confirm 호출을 '#'으로 하는 것 — 운영 백엔드는 그냥 틀린 코드로 거절한다.
    describe('dev bypass — 인증번호 없이 통과', () => {
        it('운영 빌드에는 버튼이 없다', async () => {
            (isDevBuild as jest.Mock).mockReturnValue(false);
            renderScreen();

            expect(screen.queryByText('phoneVerify.devBypass')).not.toBeInTheDocument();
        });

        it('코드를 요청하기 전에는 누를 수 없다 — 서버가 대조할 인증이 없다', () => {
            (isDevBuild as jest.Mock).mockReturnValue(true);
            renderScreen();

            expect(screen.getByText('phoneVerify.devBypass')).toBeDisabled();
        });

        it('login 모드는 우회 코드로 곧장 confirm하고 토큰을 적용한다', async () => {
            (isDevBuild as jest.Mock).mockReturnValue(true);
            mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
            mockConfirm.mockResolvedValueOnce({ $token: 'tok' });
            renderScreen();
            typePhone();
            await submitSend();

            fireEvent.click(screen.getByText('phoneVerify.devBypass'));

            await waitFor(() =>
                expect(mockConfirm).toHaveBeenCalledWith(PHONE_E164, '#', { mode: 'login', countryCode: 'KR' })
            );
            expect(mockVerify).not.toHaveBeenCalled();
        });

        // link 모드는 confirm 전에 verify로 linkable을 물어야 한다 — 실코드와 같은 2단계.
        it('link 모드는 verify를 거친 뒤 confirm한다', async () => {
            (isDevBuild as jest.Mock).mockReturnValue(true);
            mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
            mockVerify.mockResolvedValueOnce({ linkable: true });
            mockConfirm.mockResolvedValueOnce({});
            renderScreen({ mode: 'link' });
            typePhone();
            await submitSend();

            fireEvent.click(screen.getByText('phoneVerify.devBypass'));

            await waitFor(() =>
                expect(mockVerify).toHaveBeenCalledWith(PHONE_E164, '#', { mode: 'link', countryCode: 'KR' })
            );
            await waitFor(() =>
                expect(mockConfirm).toHaveBeenCalledWith(PHONE_E164, '#', { mode: 'link', countryCode: 'KR' })
            );
        });

        // 서버가 거절하면 평소 실패 경로를 그대로 탄다 — 우회는 클라이언트 판단이 아니다.
        it('서버가 거절하면 일반 코드와 같은 오류를 보여준다', async () => {
            (isDevBuild as jest.Mock).mockReturnValue(true);
            mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
            mockConfirm.mockRejectedValueOnce(new Error('403 FORBIDDEN - otp mismatch'));
            renderScreen();
            typePhone();
            await submitSend();

            fireEvent.click(screen.getByText('phoneVerify.devBypass'));

            expect(await screen.findByText('phoneVerify.wrongCode')).toBeInTheDocument();
        });
    });

    it('dev 스위치를 켜지 않으면 발송 옵션에 스위치가 아예 실리지 않는다 (서버 기본값 보존)', async () => {
        (isDevBuild as jest.Mock).mockReturnValue(true);
        mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
        renderScreen({ inviteCode: undefined });
        typePhone();
        await submitSend();

        expect(mockSend).toHaveBeenCalledWith(PHONE_E164, { mode: 'login', code: undefined, countryCode: 'KR' });
    });
});

describe('PhoneVerifyScreen — 인증번호 확인', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seedCountry();
        mockLinkedSocial = 'unknown';
        (isDevBuild as jest.Mock).mockReturnValue(false);
    });

    it('6자리를 채우면 login 모드는 verify를 건너뛰고 곧장 confirm한다 (ADR-0042 §4)', async () => {
        mockConfirm.mockResolvedValueOnce({ linked: true, $token: undefined });
        const { onVerified } = await requestCode();
        await pasteOtp();

        expect(mockConfirm).toHaveBeenCalledWith(PHONE_E164, '123456', { mode: 'login', countryCode: 'KR' });
        // `verify` would only repeat what confirm already proves, so login never asks.
        expect(mockVerify).not.toHaveBeenCalled();
        // Linked-only result: no session change, so no switch — straight to onVerified.
        expect(mockApplySessionToken).not.toHaveBeenCalled();
        expect(onVerified).toHaveBeenCalled();
    });

    it('$token이 오면 applySessionToken 완료 후에 onVerified를 부른다 (세션 전환까지가 완료)', async () => {
        const $token = { Token: { identityToken: 'main' }, $auth: { id: 'auth-1' } };
        mockConfirm.mockResolvedValueOnce({ linked: true, $token });
        let resolveApply: () => void = () => undefined;
        mockApplySessionToken.mockReturnValueOnce(new Promise<void>(resolve => (resolveApply = resolve)));

        const { onVerified } = await requestCode();
        await pasteOtp();

        expect(mockApplySessionToken).toHaveBeenCalledWith($token);
        expect(onVerified).not.toHaveBeenCalled(); // not before the switch settles

        await act(async () => resolveApply());
        expect(onVerified).toHaveBeenCalled();
    });

    it('403 오답은 "인증번호를 정확히" 에러를 보여 주고 다시 시도할 수 있다', async () => {
        mockConfirm.mockRejectedValueOnce(new Error('403 FORBIDDEN - otp mismatch'));
        const { onVerified } = await requestCode();
        await pasteOtp();

        expect(screen.getByText('phoneVerify.wrongCode')).toBeInTheDocument();
        expect(onVerified).not.toHaveBeenCalled();
    });

    it('429(오답 5회)는 재전송을 유도한다 — 재전송해도 카운터가 유지된다는 케이스', async () => {
        mockConfirm.mockRejectedValueOnce(new Error('429 TOO MANY REQUESTS - attempts exceeded'));
        await requestCode();
        await pasteOtp();

        expect(screen.getByText('phoneVerify.attemptsExceeded')).toBeInTheDocument();
    });

    it('400(미발송·만료)은 만료 안내를 보여 준다', async () => {
        mockConfirm.mockRejectedValueOnce(new Error('400 BAD REQUEST - expired'));
        await requestCode();
        await pasteOtp();

        expect(screen.getByText('phoneVerify.codeExpired')).toBeInTheDocument();
    });

    it('applySessionToken 실패 시 재시도 버튼이 나타나고, 재시도는 confirm 없이 전환만 다시 한다', async () => {
        const $token = { Token: { identityToken: 'main' }, $auth: { id: 'auth-1' } };
        mockConfirm.mockResolvedValueOnce({ linked: true, $token });
        mockApplySessionToken.mockRejectedValueOnce(new Error('[applySessionToken] relay re-auth not confirmed'));

        const { onVerified } = await requestCode();
        await pasteOtp();

        expect(screen.getByText('phoneVerify.sessionSwitchFailed')).toBeInTheDocument();
        expect(onVerified).not.toHaveBeenCalled();

        mockApplySessionToken.mockResolvedValueOnce(undefined);
        await act(async () => {
            fireEvent.click(screen.getByText('phoneVerify.retry'));
        });

        expect(mockConfirm).toHaveBeenCalledTimes(1); // the OTP was consumed — never re-proved
        expect(mockApplySessionToken).toHaveBeenCalledTimes(2);
        expect(mockApplySessionToken).toHaveBeenLastCalledWith($token);
        expect(onVerified).toHaveBeenCalled();
    });

    it('"시간 연장"과 "재전송"은 둘 다 step=resend로 가고 카운터 유지 안내를 띄운다 (ADR-0033 D9)', async () => {
        await requestCode();
        mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });

        await act(async () => {
            fireEvent.click(screen.getByText('phoneVerify.extend'));
        });

        expect(mockSend).toHaveBeenLastCalledWith(PHONE_E164, {
            mode: 'login',
            code: 'invt:i1:code',
            countryCode: 'KR',
            resend: true,
        });
        expect(mockToast).toHaveBeenCalledWith({
            title: 'phoneVerify.resent',
            description: 'phoneVerify.resendKeepsCounter',
        });
        expect(screen.getByText('phoneVerify.resendKeepsCounter')).toBeInTheDocument();

        mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
        await act(async () => {
            fireEvent.click(screen.getByText('phoneVerify.resend'));
        });
        expect(mockSend).toHaveBeenLastCalledWith(PHONE_E164, {
            mode: 'login',
            code: 'invt:i1:code',
            countryCode: 'KR',
            resend: true,
        });
    });

    it('재전송 중 429는 쿨다운 안내로 구분한다 (60초 제한)', async () => {
        await requestCode();
        mockSend.mockRejectedValueOnce(new Error('429 TOO MANY REQUESTS - cooldown'));

        await act(async () => {
            fireEvent.click(screen.getByText('phoneVerify.resend'));
        });

        expect(screen.getByText('phoneVerify.cooldown')).toBeInTheDocument();
    });

    it('클라 카운터로 재전송 5회를 넘기면 서버를 부르지 않고 초과 안내를 띄운다 (서버 429 이전의 가드)', async () => {
        await requestCode();

        for (let i = 0; i < 5; i += 1) {
            mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
            await act(async () => {
                fireEvent.click(screen.getByText('phoneVerify.resend'));
            });
        }
        // 1 initial request + 5 resends; the cap is now spent.
        expect(mockSend).toHaveBeenCalledTimes(6);

        // Each control names itself in the over-limit dialog (Figma 3432-61459 / 3428-60218).
        await act(async () => {
            fireEvent.click(screen.getByText('phoneVerify.resend'));
        });
        expect(screen.getByText('phoneVerify.limit.resend.title')).toBeInTheDocument();
        expect(mockSend).toHaveBeenCalledTimes(6); // never reached the server

        await act(async () => {
            fireEvent.click(screen.getByText('phoneVerify.extend'));
        });
        expect(screen.getByText('phoneVerify.limit.extend.title')).toBeInTheDocument();
        expect(mockSend).toHaveBeenCalledTimes(6);
    });
});

describe('PhoneVerifyScreen — link 모드 (번호 연결)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seedCountry();
        mockLinkedSocial = 'unknown';
        (isDevBuild as jest.Mock).mockReturnValue(false);
    });

    it('link 모드 발송에는 초대 코드를 싣지 않는다 (서버가 login에서만 읽는다)', async () => {
        await requestCode({ mode: 'link' });

        expect(mockSend).toHaveBeenCalledWith(PHONE_E164, { mode: 'link', code: undefined, countryCode: 'KR' });
    });

    it('6자리를 채우면 verify까지만 가고, 커밋은 CTA가 한다 (ADR-0042 §4)', async () => {
        mockVerify.mockResolvedValueOnce({ linkable: true });
        const { onVerified } = await requestCode({ mode: 'link' });
        await pasteOtp();

        expect(mockVerify).toHaveBeenCalledWith(PHONE_E164, '123456', { mode: 'link', countryCode: 'KR' });
        expect(mockConfirm).not.toHaveBeenCalled();
        expect(onVerified).not.toHaveBeenCalled();

        // 연결은 세션을 건드리지 않으므로 $token도, 전환도 없다.
        mockConfirm.mockResolvedValueOnce({ linked: true });
        await submitCta();

        expect(mockConfirm).toHaveBeenCalledWith(PHONE_E164, '123456', { mode: 'link', countryCode: 'KR' });
        expect(mockApplySessionToken).not.toHaveBeenCalled();
        expect(onVerified).toHaveBeenCalled();
    });

    it('linkable:false(type-linked)는 confirm 없이 "이미 다른 번호를 연결" 문구로 막는다', async () => {
        mockVerify.mockResolvedValueOnce({ linkable: false, reason: 'type-linked' });
        const { onVerified } = await requestCode({ mode: 'link' });
        await pasteOtp();

        expect(screen.getByText('phoneVerify.linkTypeAlreadyLinked')).toBeInTheDocument();
        expect(mockConfirm).not.toHaveBeenCalled();
        expect(onVerified).not.toHaveBeenCalled();
    });

    it('linkable:false(그 외)는 번호가 이미 남의 계정에 붙었다고 안내한다', async () => {
        mockVerify.mockResolvedValueOnce({ linkable: false, reason: 'occupied' });
        await requestCode({ mode: 'link' });
        await pasteOtp();

        expect(screen.getByText('phoneVerify.linkOccupied')).toBeInTheDocument();
        expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('verify를 지나쳐 confirm이 409면 같은 점유 안내로 떨어진다', async () => {
        mockVerify.mockResolvedValueOnce({ linkable: true });
        mockConfirm.mockRejectedValueOnce(new Error('409 CONFLICT - phone already linked'));
        const { onVerified } = await requestCode({ mode: 'link' });
        await pasteOtp();
        await submitCta();

        expect(screen.getByText('phoneVerify.linkOccupied')).toBeInTheDocument();
        expect(onVerified).not.toHaveBeenCalled();
    });

    it('보증받지 못한 코드로 CTA를 누르면 confirm이 아니라 verify를 다시 거친다 (맨 409/403 방지)', async () => {
        mockVerify.mockResolvedValue({ linkable: false, reason: 'occupied' });
        await requestCode({ mode: 'link' });
        await pasteOtp();

        await submitCta();

        expect(mockVerify).toHaveBeenCalledTimes(2);
        expect(mockConfirm).not.toHaveBeenCalled();
    });
});

describe('PhoneVerifyScreen — 타이머 만료', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seedCountry();
        mockLinkedSocial = 'unknown';
        (isDevBuild as jest.Mock).mockReturnValue(false);
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-07-29T12:00:00Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('expiredAt이 지나면 만료 안내가 뜨고 제출이 비활성화되며 자동 제출도 멈춘다', async () => {
        mockSend.mockResolvedValueOnce({ sent: true, expiredAt: Date.now() + 2_000 });
        renderScreen();
        typePhone();
        await submitSend();

        await act(async () => {
            jest.advanceTimersByTime(3_000);
        });

        expect(screen.getByText('phoneVerify.codeExpired')).toBeInTheDocument();
        expect(screen.getByText('phoneVerify.complete').closest('button')).toBeDisabled();

        await pasteOtp();
        expect(mockConfirm).not.toHaveBeenCalled();
    });
});

describe('PhoneVerifyScreen — 국가 (ADR-0044)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seedCountry();
        mockLinkedSocial = 'unknown';
        (isDevBuild as jest.Mock).mockReturnValue(false);
    });

    afterEach(() => setLanguage('en-US'));

    it('국가를 정할 수 없으면 인증 요청이 비활성이고, 에러 문구는 띄우지 않는다 (S4)', () => {
        localStorage.clear();
        setLanguage('en'); // no region subtag — nothing to derive a country from
        renderScreen();

        typePhone();
        expect(screen.getByText('phoneVerify.sendCode').closest('button')).toBeDisabled();
        // Nothing has gone wrong yet; the empty picker is the instruction, not a red line.
        expect(screen.queryByText('phoneVerify.phoneInvalidFormat')).not.toBeInTheDocument();
        expect(screen.getByText('phoneInput.countryPlaceholder')).toBeInTheDocument();

        pickCountry('일본');
        typePhone('09012345678');
        expect(screen.getByText('phoneVerify.sendCode').closest('button')).toBeEnabled();
    });

    it('국제 표기를 붙여넣으면 선택기가 따라가고 필드가 로컬 형태로 다시 쓰인다 (S3)', async () => {
        mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
        renderScreen();

        typePhone('+819012345678');

        expect(screen.getByPlaceholderText('phoneVerify.phonePlaceholder')).toHaveValue('09012345678');
        expect(screen.getByText('+81')).toBeInTheDocument();

        await submitSend();
        expect(mockSend).toHaveBeenCalledWith('+819012345678', {
            mode: 'login',
            code: 'invt:i1:code',
            countryCode: 'JP',
        });
    });

    it('+82 붙여넣기도 살아난다 — KR 전용 검증에서는 실패하던 입력이다 (S3)', () => {
        renderScreen();
        typePhone('+821012345678');

        expect(screen.getByPlaceholderText('phoneVerify.phonePlaceholder')).toHaveValue(PHONE);
        expect(screen.getByText('phoneVerify.sendCode').closest('button')).toBeEnabled();
    });

    it('코드를 받은 뒤 국가를 바꾸면 발송된 코드가 무효화된다 (S5)', async () => {
        await requestCode();
        expect(screen.getByPlaceholderText('phoneVerify.codePlaceholder')).toBeEnabled();

        pickCountry('일본');

        // Same handling as retyping the number: the code that went to +82 is not the code for +81.
        expect(screen.getByPlaceholderText('phoneVerify.codePlaceholder')).toBeDisabled();
        await pasteOtp();
        expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('증명은 발송에 쓴 값을 그대로 쓴다 — 라이브 필드가 아니다 (계약: 발송=증명)', async () => {
        mockConfirm.mockResolvedValueOnce({ linked: true });
        await requestCode();

        // The picker cannot diverge after a send (S5 clears the code), so the pin is proved by the
        // prove call carrying the SEND's country rather than re-deriving one at confirm time.
        await pasteOtp();
        expect(mockConfirm).toHaveBeenCalledWith(PHONE_E164, '123456', { mode: 'login', countryCode: 'KR' });
    });
});

// jsdom has no layout engine, so these assert the three rules rather than the pixels they buy. They
// are worth pinning because each is invisible at 375px — the width most desks test at — and only
// bites on a narrower phone or once the soft keyboard is up. Measured against the compiled CSS:
// without them the dialog's content floored at 364px (spilling 44px at 320 and 4px at the very
// common 360, out BOTH edges thanks to the `-translate-x-1/2` centring) and the body never became
// scrollable, so a focused field stayed stuck behind the keyboard.
describe('PhoneVerifyScreen — 좁은 화면·키보드 (레이아웃 제약)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seedCountry();
        mockLinkedSocial = 'unknown';
        (isDevBuild as jest.Mock).mockReturnValue(false);
    });

    it('그리드 행을 다이얼로그 높이에 묶고, 열은 min-content 아래로 줄어들 수 있어야 한다', () => {
        renderScreen();

        // DialogContent is a `grid`; an auto row grows to its item's max-content and a grid item
        // refuses to shrink below min-content. Both defaults have to be overridden.
        const dialog = screen.getByRole('dialog');
        expect(dialog.className).toContain('grid-rows-[minmax(0,1fr)]');

        const column = dialog.querySelector('.flex.h-full');
        expect(column?.className).toContain('min-w-0');
    });

    it('본문은 min-h-0이라 줄어들며 스크롤된다 — 키보드에 가린 필드로 갈 수 있는 유일한 길이다', () => {
        renderScreen();

        const scroller = screen.getByRole('dialog').querySelector('.overflow-y-auto');
        expect(scroller).not.toBeNull();
        expect(scroller?.className).toContain('min-h-0');
    });
});

describe('PhoneVerifyScreen — 닫기/컨텍스트', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seedCountry();
        mockLinkedSocial = 'unknown';
        (isDevBuild as jest.Mock).mockReturnValue(false);
    });

    it('컨텍스트에 맞는 설명 문구를 보여 준다', () => {
        renderScreen({ context: 'invite-create', inviteCode: undefined });
        expect(screen.getByText('phoneVerify.descriptionInviteCreate')).toBeInTheDocument();
    });

    it('닫기는 onClose를 부른다', () => {
        const { onClose } = renderScreen();
        fireEvent.click(screen.getByLabelText('close'));
        expect(onClose).toHaveBeenCalled();
    });

    it('번호를 고치면 살아 있던 인증번호를 버리고 인증 요청을 다시 열어 준다', async () => {
        await requestCode();
        expect(screen.getByText('phoneVerify.sendCode').closest('button')).toBeDisabled();

        typePhone('01087654321');

        await waitFor(() => expect(screen.getByText('phoneVerify.sendCode').closest('button')).toBeEnabled());
        expect(screen.getByPlaceholderText('phoneVerify.codePlaceholder')).toBeDisabled();
    });
});
