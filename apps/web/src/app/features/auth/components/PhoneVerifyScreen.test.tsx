import '@testing-library/jest-dom';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockSend = jest.fn();
const mockVerify = jest.fn();
const mockConfirm = jest.fn();
const mockConfirmPhoneLogin = jest.fn();
const mockRetryPhoneLogin = jest.fn();
const mockCancelPhoneLogin = jest.fn();
const mockToast = jest.fn();
const mockNavigate = jest.fn();
let mockLinkedSocial: 'linked' | 'absent' | 'unknown' = 'unknown';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }),
}));
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => mockNavigate,
}));
jest.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/invite/accept', search: '', hash: '' }) }));
jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        session: {
            confirmPhoneLogin: (...args: unknown[]) => mockConfirmPhoneLogin(...args),
            retryPhoneLogin: (...args: unknown[]) => mockRetryPhoneLogin(...args),
            cancelPhoneLogin: (...args: unknown[]) => mockCancelPhoneLogin(...args),
            PHONE_LOGIN_NOTHING_PENDING: 'PHONE_LOGIN_NOTHING_PENDING',
            PHONE_LOGIN_NO_TOKEN: 'PHONE_LOGIN_NO_TOKEN',
            PHONE_LOGIN_SWITCH_FAILED: 'PHONE_LOGIN_SWITCH_FAILED',
        },
    })
);
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
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
jest.mock('../../../hooks/useLinkedAccounts', () => ({
    useLinkedAccounts: () => ({ phone: 'unknown', social: mockLinkedSocial }),
}));

import { isDevBuild } from '../../../utils/buildEnv';
import { PhoneVerifyScreen } from './PhoneVerifyScreen';
import { seedPhoneCountry } from '../../../../testing/phoneCountry';

const PHONE = '01012345678';
const PHONE_E164 = '+821012345678';
const FUTURE_EXPIRY = () => Date.now() + 180_000;

const seedCountry = (code = 'KR') => {
    seedPhoneCountry(code);
};

const setLanguage = (value: string) => {
    Object.defineProperty(window.navigator, 'language', { value, configurable: true });
};

const pickCountry = (name: string) => {
    fireEvent.click(screen.getByLabelText('phoneInput.countrySheetTitle'));
    fireEvent.click(screen.getByText(name));
};

const renderScreen = (overrides: Partial<React.ComponentProps<typeof PhoneVerifyScreen>> = {}) => {
    const props = {
        context: 'invite-accept' as const,
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

const requestCode = async (overrides: Partial<React.ComponentProps<typeof PhoneVerifyScreen>> = {}) => {
    mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
    const props = renderScreen(overrides);
    typePhone();
    await submitSend();
    return props;
};

const pasteOtp = async (code = '123456') => {
    await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('phoneVerify.codePlaceholder'), { target: { value: code } });
    });
};

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
        expect(mockSend).not.toHaveBeenCalled();
        expect(screen.getByPlaceholderText('phoneVerify.codePlaceholder')).toBeDisabled();

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
        expect(mockNavigate).toHaveBeenCalledWith('/mypage/login', { state: { returnTo: '/invite/accept' } });
    });

    it('소셜이 이미 연결돼 있으면 배너를 띄우지 않는다', () => {
        mockLinkedSocial = 'linked';
        renderScreen();

        expect(screen.queryByText('phoneVerify.socialFirstTitle')).not.toBeInTheDocument();
    });

    it.each(['absent', 'unknown'] as const)('social이 %s면 배너는 그대로 뜬다', social => {
        mockLinkedSocial = social;
        renderScreen();

        expect(screen.getByText('phoneVerify.socialFirstTitle')).toBeInTheDocument();
    });

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

        it('signs in with the bypass code straight away in login mode, through the runtime', async () => {
            (isDevBuild as jest.Mock).mockReturnValue(true);
            mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
            mockConfirmPhoneLogin.mockResolvedValueOnce({ isNew: false });
            renderScreen();
            typePhone();
            await submitSend();

            fireEvent.click(screen.getByText('phoneVerify.devBypass'));

            await waitFor(() =>
                expect(mockConfirmPhoneLogin).toHaveBeenCalledWith(PHONE_E164, '#', { countryCode: 'KR' })
            );
            expect(mockVerify).not.toHaveBeenCalled();
        });

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

        it('서버가 거절하면 일반 코드와 같은 오류를 보여준다', async () => {
            (isDevBuild as jest.Mock).mockReturnValue(true);
            mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
            mockConfirmPhoneLogin.mockRejectedValueOnce(new Error('403 FORBIDDEN - otp mismatch'));
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

    it('signs in through the runtime on the sixth digit in login mode, without asking verify', async () => {
        mockConfirmPhoneLogin.mockResolvedValueOnce({ isNew: false });
        const { onVerified } = await requestCode();
        await pasteOtp();

        expect(mockConfirmPhoneLogin).toHaveBeenCalledWith(PHONE_E164, '123456', { countryCode: 'KR' });
        expect(mockVerify).not.toHaveBeenCalled();
        expect(mockConfirm).not.toHaveBeenCalled();
        expect(onVerified).toHaveBeenCalled();
    });

    it('calls onVerified only once the runtime has finished the session switch', async () => {
        let finish: () => void = () => undefined;
        mockConfirmPhoneLogin.mockReturnValueOnce(new Promise(resolve => (finish = () => resolve({ isNew: false }))));

        const { onVerified } = await requestCode();
        await pasteOtp();

        expect(onVerified).not.toHaveBeenCalled();

        await act(async () => finish());
        expect(onVerified).toHaveBeenCalled();
    });

    it('403 오답은 "인증번호를 정확히" 에러를 보여 주고 다시 시도할 수 있다', async () => {
        mockConfirmPhoneLogin.mockRejectedValueOnce(new Error('403 FORBIDDEN - otp mismatch'));
        const { onVerified } = await requestCode();
        await pasteOtp();

        expect(screen.getByText('phoneVerify.wrongCode')).toBeInTheDocument();
        expect(onVerified).not.toHaveBeenCalled();
    });

    it('429(오답 5회)는 재전송을 유도한다 — 재전송해도 카운터가 유지된다는 케이스', async () => {
        mockConfirmPhoneLogin.mockRejectedValueOnce(new Error('429 TOO MANY REQUESTS - attempts exceeded'));
        await requestCode();
        await pasteOtp();

        expect(screen.getByText('phoneVerify.attemptsExceeded')).toBeInTheDocument();
    });

    it('400(미발송·만료)은 만료 안내를 보여 준다', async () => {
        mockConfirmPhoneLogin.mockRejectedValueOnce(new Error('400 BAD REQUEST - expired'));
        await requestCode();
        await pasteOtp();

        expect(screen.getByText('phoneVerify.codeExpired')).toBeInTheDocument();
    });

    it('refuses a login confirm that came back without a session token, instead of reporting success', async () => {
        mockConfirmPhoneLogin.mockRejectedValueOnce(
            Object.assign(new Error('no token'), { code: 'PHONE_LOGIN_NO_TOKEN' })
        );
        const { onVerified } = await requestCode();
        await pasteOtp();

        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'phoneVerify.verifyFailed' }));
        expect(onVerified).not.toHaveBeenCalled();
    });

    it('offers a retry when the switch failed, and the retry switches again without proving the code', async () => {
        mockConfirmPhoneLogin.mockRejectedValueOnce(
            Object.assign(new Error('switch failed'), { code: 'PHONE_LOGIN_SWITCH_FAILED' })
        );

        const { onVerified } = await requestCode();
        await pasteOtp();

        expect(screen.getByText('phoneVerify.sessionSwitchFailed')).toBeInTheDocument();
        expect(onVerified).not.toHaveBeenCalled();

        mockRetryPhoneLogin.mockResolvedValueOnce({ isNew: false });
        await act(async () => {
            fireEvent.click(screen.getByText('phoneVerify.retry'));
        });

        expect(mockConfirmPhoneLogin).toHaveBeenCalledTimes(1);
        expect(mockRetryPhoneLogin).toHaveBeenCalledTimes(1);
        expect(onVerified).toHaveBeenCalled();
    });

    it('goes back to the code when the runtime has nothing left to finish', async () => {
        mockConfirmPhoneLogin.mockRejectedValueOnce(
            Object.assign(new Error('switch failed'), { code: 'PHONE_LOGIN_SWITCH_FAILED' })
        );
        const { onVerified } = await requestCode();
        await pasteOtp();

        mockRetryPhoneLogin.mockRejectedValueOnce(
            Object.assign(new Error('nothing pending'), { code: 'PHONE_LOGIN_NOTHING_PENDING' })
        );
        await act(async () => {
            fireEvent.click(screen.getByText('phoneVerify.retry'));
        });

        expect(screen.getByText('phoneVerify.verifyFailed')).toBeInTheDocument();
        expect(screen.queryByText('phoneVerify.retry')).not.toBeInTheDocument();
        expect(onVerified).not.toHaveBeenCalled();
    });

    it('cancels the login the runtime keeps waiting when the screen closes', async () => {
        const { unmount } = render(
            <PhoneVerifyScreen context="invite-accept" mode="login" onVerified={jest.fn()} onClose={jest.fn()} />
        );
        mockCancelPhoneLogin.mockClear();

        unmount();

        expect(mockCancelPhoneLogin).toHaveBeenCalledTimes(1);
    });

    it('"시간 연장"과 "재전송"은 둘 다 step=resend로 가고 카운터 유지 안내를 띄운다 (ADR-0089 D9)', async () => {
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
        expect(mockSend).toHaveBeenCalledTimes(6);

        await act(async () => {
            fireEvent.click(screen.getByText('phoneVerify.resend'));
        });
        expect(screen.getByText('phoneVerify.limit.resend.title')).toBeInTheDocument();
        expect(mockSend).toHaveBeenCalledTimes(6);

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

        mockConfirm.mockResolvedValueOnce({ linked: true });
        await submitCta();

        expect(mockConfirm).toHaveBeenCalledWith(PHONE_E164, '123456', { mode: 'link', countryCode: 'KR' });
        expect(mockConfirmPhoneLogin).not.toHaveBeenCalled();
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
        seedPhoneCountry();
        setLanguage('en');
        renderScreen();

        typePhone();
        expect(screen.getByText('phoneVerify.sendCode').closest('button')).toBeDisabled();
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

        expect(screen.getByPlaceholderText('phoneVerify.codePlaceholder')).toBeDisabled();
        await pasteOtp();
        expect(mockConfirmPhoneLogin).not.toHaveBeenCalled();
    });

    it('증명은 발송에 쓴 값을 그대로 쓴다 — 라이브 필드가 아니다 (계약: 발송=증명)', async () => {
        mockConfirmPhoneLogin.mockResolvedValueOnce({ isNew: false });
        await requestCode();

        await pasteOtp();
        expect(mockConfirmPhoneLogin).toHaveBeenCalledWith(PHONE_E164, '123456', { countryCode: 'KR' });
    });
});

describe('PhoneVerifyScreen — 좁은 화면·키보드 (레이아웃 제약)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seedCountry();
        mockLinkedSocial = 'unknown';
        (isDevBuild as jest.Mock).mockReturnValue(false);
    });

    it('그리드 행을 다이얼로그 높이에 묶고, 열은 min-content 아래로 줄어들 수 있어야 한다', () => {
        renderScreen();

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
        fireEvent.click(screen.getByLabelText('common.close'));
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
