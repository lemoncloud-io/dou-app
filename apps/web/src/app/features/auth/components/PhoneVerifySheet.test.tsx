import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { AccountLinkMode } from '../../../hooks/useLinkAccount';

const mockSend = jest.fn();
const mockVerify = jest.fn();
const mockConfirm = jest.fn();
const mockApplySessionToken = jest.fn();

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }),
}));
jest.mock('@chatic/app-runtime', () => ({
    applySessionToken: (...args: unknown[]) => mockApplySessionToken(...args),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
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
jest.mock('../../../utils/buildEnv', () => ({ isDevBuild: () => false }));

import { PhoneVerifySheet } from './PhoneVerifySheet';

const PHONE = '01012345678';
// The field shows the local form; the packet carries E.164 now (ADR-0044 §5 correction).
const PHONE_E164 = '+821012345678';

/** jsdom's locale is `en-US`; seed the remembered pick so these Korean numbers validate (ADR-0044 §4). */
const seedCountry = () => {
    localStorage.clear();
    localStorage.setItem('dou.phoneInput.country.v1', 'KR');
};

/** The sheet serves both sides: the issue/guest gate logs in, the mypage account row links. */
const renderSheet = (mode: AccountLinkMode = 'login') => {
    const props = { mode, onVerified: jest.fn(), onClose: jest.fn() };
    render(<PhoneVerifySheet {...props} />);
    return props;
};

const requestCode = async () => {
    mockSend.mockResolvedValueOnce({ sent: true, expiredAt: Date.now() + 180_000 });
    fireEvent.change(screen.getByPlaceholderText('phoneVerify.phonePlaceholder'), { target: { value: PHONE } });
    await act(async () => {
        fireEvent.click(screen.getByText('phoneVerify.sendCode'));
    });
};

const pasteOtp = async (code = '123456') => {
    await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('phoneVerify.codePlaceholder'), { target: { value: code } });
    });
};

describe('PhoneVerifySheet', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seedCountry();
    });

    it('발급 흐름이라 계정 갈라짐 방어 배너를 렌더하지 않는다 (ADR-0034 결정 4)', () => {
        renderSheet();

        // The full-screen shell owns this warning; the sheet design deliberately leaves it out. If a
        // future edit moves the banner into the shared body, this fails instead of silently drifting.
        expect(screen.queryByText('phoneVerify.socialFirstTitle')).not.toBeInTheDocument();
    });

    it('시트 chrome은 타이틀·닫기·완료 CTA를 갖는다', () => {
        const { onClose } = renderSheet();

        expect(screen.getByText('phoneVerify.sheetTitle')).toBeInTheDocument();
        expect(screen.getByText('phoneVerify.complete')).toBeInTheDocument();
        // Twice on purpose: the visible copy is aria-hidden, and BottomSheet also renders it sr-only
        // so Radix can link it as the dialog's description (screen readers hear it once).
        expect(screen.getAllByText('phoneVerify.sheetDescription')).toHaveLength(2);

        fireEvent.click(screen.getByLabelText('common.close'));
        expect(onClose).toHaveBeenCalled();
    });

    it('세션 전환이 실패하면 완료 대신 다시 시도를 노출한다 (소비된 OTP를 재검증하지 않는다)', async () => {
        const $token = { Token: { identityToken: 'main' }, $auth: { id: 'auth-1' } };
        mockConfirm.mockResolvedValueOnce({ linked: true, $token });
        mockApplySessionToken.mockRejectedValueOnce(new Error('relay re-auth not confirmed'));

        const { onVerified } = renderSheet();
        await requestCode();
        await pasteOtp();

        expect(screen.getByText('phoneVerify.retry')).toBeInTheDocument();
        expect(onVerified).not.toHaveBeenCalled();
        expect(mockConfirm).toHaveBeenCalledTimes(1);
    });

    it('login 모드는 발송에 mode와 초대 코드를 싣고, 6자리에서 곧장 confirm한다', async () => {
        mockConfirm.mockResolvedValueOnce({ linked: true });
        mockApplySessionToken.mockResolvedValueOnce(undefined);

        const { onVerified } = renderSheet('login');
        await requestCode();
        await pasteOtp();

        expect(mockSend).toHaveBeenCalledWith(PHONE_E164, { mode: 'login', code: undefined, countryCode: 'KR' });
        expect(mockConfirm).toHaveBeenCalledWith(PHONE_E164, '123456', { mode: 'login', countryCode: 'KR' });
        expect(mockVerify).not.toHaveBeenCalled();
        expect(onVerified).toHaveBeenCalled();
    });

    it('link 모드는 verify로 물어본 뒤 CTA에서 confirm한다 — 세션은 그대로다', async () => {
        mockVerify.mockResolvedValueOnce({ linkable: true });
        mockConfirm.mockResolvedValueOnce({ linked: true });

        const { onVerified } = renderSheet('link');
        await requestCode();
        await pasteOtp();

        expect(mockSend).toHaveBeenCalledWith(PHONE_E164, { mode: 'link', code: undefined, countryCode: 'KR' });
        expect(mockVerify).toHaveBeenCalledWith(PHONE_E164, '123456', { mode: 'link', countryCode: 'KR' });
        expect(mockConfirm).not.toHaveBeenCalled();

        await act(async () => {
            fireEvent.click(screen.getByText('phoneVerify.complete'));
        });

        expect(mockConfirm).toHaveBeenCalledWith(PHONE_E164, '123456', { mode: 'link', countryCode: 'KR' });
        expect(mockApplySessionToken).not.toHaveBeenCalled();
        expect(onVerified).toHaveBeenCalled();
    });

    it('link 모드에서 linkable:false면 confirm하지 않고 사유별 문구를 보여 준다', async () => {
        mockVerify.mockResolvedValueOnce({ linkable: false, reason: 'type-linked' });

        renderSheet('link');
        await requestCode();
        await pasteOtp();

        expect(screen.getByText('phoneVerify.linkTypeAlreadyLinked')).toBeInTheDocument();
        expect(mockConfirm).not.toHaveBeenCalled();
    });
});
