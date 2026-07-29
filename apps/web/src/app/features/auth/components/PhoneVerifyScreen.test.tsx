import '@testing-library/jest-dom';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockSend = jest.fn();
const mockCheck = jest.fn();
const mockApplySessionToken = jest.fn();
const mockToast = jest.fn();
const mockNavigate = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => mockNavigate }));
jest.mock('@chatic/app-runtime', () => ({
    applySessionToken: (...args: unknown[]) => mockApplySessionToken(...args),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
// Radix overlays are stubbed as pass-through markup (house convention — see AddFriendSheet.test).
jest.mock('@chatic/ui-kit/components/ui/dialog', () => ({
    Dialog: ({ open, children }: any) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children }: any) => <div>{children}</div>,
    DialogTitle: ({ children }: any) => <div>{children}</div>,
    DialogDescription: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('../../../hooks/useVerifyHashAlias', () => ({
    useVerifyHashAlias: () => ({ send: mockSend, check: mockCheck, isSending: false, isChecking: false }),
}));
jest.mock('../utils/env', () => ({ isDevBuild: jest.fn(() => false) }));

import { isDevBuild } from '../utils/env';
import { PhoneVerifyScreen } from './PhoneVerifyScreen';

const PHONE = '01012345678';
const FUTURE_EXPIRY = () => Date.now() + 180_000;

const renderScreen = (overrides: Partial<React.ComponentProps<typeof PhoneVerifyScreen>> = {}) => {
    const props = {
        context: 'invite-accept' as const,
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

/** Drives phone step → OTP step with a successful send. */
const goToOtpStep = async (overrides: Partial<React.ComponentProps<typeof PhoneVerifyScreen>> = {}) => {
    mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
    const props = renderScreen(overrides);
    typePhone();
    await submitSend();
    return props;
};

/** Pastes a full 6-digit code, which auto-submits the check. */
const pasteOtp = async (code = '123456') => {
    const [firstDigit] = screen.getAllByRole('textbox').filter(el => el.getAttribute('inputmode') === 'numeric');
    await act(async () => {
        fireEvent.paste(firstDigit, { clipboardData: { getData: () => code } });
    });
};

describe('PhoneVerifyScreen — 번호 스텝', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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

    it('발송 성공 시 초대 코드를 동봉하고 OTP 스텝으로 넘어간다', async () => {
        await goToOtpStep();

        expect(mockSend).toHaveBeenCalledWith(PHONE, { code: 'invt:i1:code' });
        expect(screen.getByText('phoneVerify.otpTitle')).toBeInTheDocument();
        expect(mockToast).toHaveBeenCalledWith({ title: 'phoneVerify.sent' });
    });

    it('초대 맥락의 발송 400은 "초대받은 번호가 아니에요"로 안내한다 (§B-2 발송단 차단)', async () => {
        mockSend.mockRejectedValueOnce(new Error('400 BAD REQUEST - phone does not match the invite'));
        renderScreen();
        typePhone();
        await submitSend();

        expect(screen.getByText('phoneVerify.inviteMismatch')).toBeInTheDocument();
        expect(screen.queryByText('phoneVerify.otpTitle')).not.toBeInTheDocument();
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
        expect(mockNavigate).toHaveBeenCalledWith('/mypage/login');
    });

    it('dev 빌드에서만 발송 스위치가 보이고, Slack 토글은 {slack:true, sms:false}로 실린다', async () => {
        (isDevBuild as jest.Mock).mockReturnValue(true);
        mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
        renderScreen();

        fireEvent.click(screen.getByLabelText('phoneVerify.devSlack'));
        typePhone();
        await submitSend();

        expect(mockSend).toHaveBeenCalledWith(PHONE, { code: 'invt:i1:code', slack: true, sms: false });
    });

    it('dev 스위치를 켜지 않으면 발송 옵션에 스위치가 아예 실리지 않는다 (서버 기본값 보존)', async () => {
        (isDevBuild as jest.Mock).mockReturnValue(true);
        mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
        renderScreen({ inviteCode: undefined });
        typePhone();
        await submitSend();

        expect(mockSend).toHaveBeenCalledWith(PHONE, { code: undefined });
    });
});

describe('PhoneVerifyScreen — OTP 스텝', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (isDevBuild as jest.Mock).mockReturnValue(false);
    });

    it('6자리를 채우면 자동 제출되고 check에 초대 코드가 동봉된다', async () => {
        mockCheck.mockResolvedValueOnce({ attached: true, $token: undefined });
        const { onVerified } = await goToOtpStep();
        await pasteOtp();

        expect(mockCheck).toHaveBeenCalledWith(PHONE, '123456', { code: 'invt:i1:code' });
        // Linked-only result: no session change, so no switch — straight to onVerified.
        expect(mockApplySessionToken).not.toHaveBeenCalled();
        expect(onVerified).toHaveBeenCalled();
    });

    it('$token이 오면 applySessionToken 완료 후에 onVerified를 부른다 (세션 전환까지가 완료)', async () => {
        const $token = { Token: { identityToken: 'main' }, $auth: { id: 'auth-1' } };
        mockCheck.mockResolvedValueOnce({ attached: true, $token });
        let resolveApply: () => void = () => undefined;
        mockApplySessionToken.mockReturnValueOnce(new Promise<void>(resolve => (resolveApply = resolve)));

        const { onVerified } = await goToOtpStep();
        await pasteOtp();

        expect(mockApplySessionToken).toHaveBeenCalledWith($token);
        expect(onVerified).not.toHaveBeenCalled(); // not before the switch settles

        await act(async () => resolveApply());
        expect(onVerified).toHaveBeenCalled();
    });

    it('403 오답은 "인증번호를 정확히" 에러를 보여 주고 다시 시도할 수 있다', async () => {
        mockCheck.mockRejectedValueOnce(new Error('403 FORBIDDEN - otp mismatch'));
        const { onVerified } = await goToOtpStep();
        await pasteOtp();

        expect(screen.getByText('phoneVerify.wrongCode')).toBeInTheDocument();
        expect(onVerified).not.toHaveBeenCalled();
    });

    it('429(오답 5회)는 재전송을 유도한다 — 재전송해도 카운터가 유지된다는 케이스', async () => {
        mockCheck.mockRejectedValueOnce(new Error('429 TOO MANY REQUESTS - attempts exceeded'));
        await goToOtpStep();
        await pasteOtp();

        expect(screen.getByText('phoneVerify.attemptsExceeded')).toBeInTheDocument();
    });

    it('400(미발송·만료)은 만료 안내를 보여 준다', async () => {
        mockCheck.mockRejectedValueOnce(new Error('400 BAD REQUEST - expired'));
        await goToOtpStep();
        await pasteOtp();

        expect(screen.getByText('phoneVerify.codeExpired')).toBeInTheDocument();
    });

    it('applySessionToken 실패 시 재시도 버튼이 나타나고, 재시도는 check 없이 전환만 다시 한다', async () => {
        const $token = { Token: { identityToken: 'main' }, $auth: { id: 'auth-1' } };
        mockCheck.mockResolvedValueOnce({ attached: true, $token });
        mockApplySessionToken.mockRejectedValueOnce(new Error('[applySessionToken] relay re-auth not confirmed'));

        const { onVerified } = await goToOtpStep();
        await pasteOtp();

        expect(screen.getByText('phoneVerify.sessionSwitchFailed')).toBeInTheDocument();
        expect(onVerified).not.toHaveBeenCalled();

        mockApplySessionToken.mockResolvedValueOnce(undefined);
        await act(async () => {
            fireEvent.click(screen.getByText('phoneVerify.retry'));
        });

        expect(mockCheck).toHaveBeenCalledTimes(1); // the OTP was consumed — never re-checked
        expect(mockApplySessionToken).toHaveBeenCalledTimes(2);
        expect(mockApplySessionToken).toHaveBeenLastCalledWith($token);
        expect(onVerified).toHaveBeenCalled();
    });

    it('"시간 연장"과 "재전송"은 둘 다 step=resend로 가고 카운터 유지 안내를 띄운다 (ADR-0033 D9)', async () => {
        await goToOtpStep();
        mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });

        await act(async () => {
            fireEvent.click(screen.getByText('phoneVerify.extend'));
        });

        expect(mockSend).toHaveBeenLastCalledWith(PHONE, { code: 'invt:i1:code', resend: true });
        expect(mockToast).toHaveBeenCalledWith({
            title: 'phoneVerify.resent',
            description: 'phoneVerify.resendKeepsCounter',
        });
        expect(screen.getByText('phoneVerify.resendKeepsCounter')).toBeInTheDocument();

        mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
        await act(async () => {
            fireEvent.click(screen.getByText('phoneVerify.resend'));
        });
        expect(mockSend).toHaveBeenLastCalledWith(PHONE, { code: 'invt:i1:code', resend: true });
    });

    it('재전송 중 429는 쿨다운 안내로 구분한다 (60초 제한)', async () => {
        await goToOtpStep();
        mockSend.mockRejectedValueOnce(new Error('429 TOO MANY REQUESTS - cooldown'));

        await act(async () => {
            fireEvent.click(screen.getByText('phoneVerify.resend'));
        });

        expect(screen.getByText('phoneVerify.cooldown')).toBeInTheDocument();
    });

    it('클라 카운터로 재전송 5회를 넘기면 버튼이 비활성화된다 (서버 429 이전의 가드)', async () => {
        await goToOtpStep();

        for (let i = 0; i < 5; i += 1) {
            mockSend.mockResolvedValueOnce({ sent: true, expiredAt: FUTURE_EXPIRY() });
            await act(async () => {
                fireEvent.click(screen.getByText('phoneVerify.resend'));
            });
        }

        expect(screen.getByText('phoneVerify.resend').closest('button')).toBeDisabled();
        expect(screen.getByText('phoneVerify.extend').closest('button')).toBeDisabled();
        expect(screen.getByText('phoneVerify.resendLimit')).toBeInTheDocument();
    });
});

describe('PhoneVerifyScreen — 타이머 만료', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
        expect(mockCheck).not.toHaveBeenCalled();
    });
});

describe('PhoneVerifyScreen — 닫기/컨텍스트', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (isDevBuild as jest.Mock).mockReturnValue(false);
    });

    it('컨텍스트에 맞는 설명 문구를 보여 준다', () => {
        renderScreen({ context: 'invite-create', inviteCode: undefined });
        expect(screen.getByText('phoneVerify.descriptionInviteCreate')).toBeInTheDocument();
    });

    it('뒤로 가기는 onClose를 부른다', () => {
        const { onClose } = renderScreen();
        fireEvent.click(screen.getByLabelText('close'));
        expect(onClose).toHaveBeenCalled();
    });

    it('OTP 스텝의 뒤로 가기는 번호 스텝으로 돌아간다', async () => {
        await goToOtpStep();
        fireEvent.click(screen.getByLabelText('back'));

        await waitFor(() => expect(screen.getByText('phoneVerify.sendCode')).toBeInTheDocument());
        expect(screen.getByPlaceholderText('phoneVerify.phonePlaceholder')).toBeInTheDocument();
    });
});
