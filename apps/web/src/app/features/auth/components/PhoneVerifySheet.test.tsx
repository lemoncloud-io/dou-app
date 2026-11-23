import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { AccountLinkMode } from '../../../hooks/useLinkAccount';

const mockSend = jest.fn();
const mockVerify = jest.fn();
const mockConfirm = jest.fn();
const mockConfirmPhoneLogin = jest.fn();

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }),
}));
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        session: {
            confirmPhoneLogin: (...args: unknown[]) => mockConfirmPhoneLogin(...args),
            retryPhoneLogin: jest.fn(),
            cancelPhoneLogin: jest.fn(),
            PHONE_LOGIN_NOTHING_PENDING: 'PHONE_LOGIN_NOTHING_PENDING',
            PHONE_LOGIN_NO_TOKEN: 'PHONE_LOGIN_NO_TOKEN',
            PHONE_LOGIN_SWITCH_FAILED: 'PHONE_LOGIN_SWITCH_FAILED',
        },
    })
);
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
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
import { seedPhoneCountry } from '../../../../testing/phoneCountry';

const PHONE = '01012345678';
const PHONE_E164 = '+821012345678';

const seedCountry = () => {
    seedPhoneCountry('KR');
};

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

        expect(screen.queryByText('phoneVerify.socialFirstTitle')).not.toBeInTheDocument();
    });

    it('시트 chrome은 타이틀·닫기·완료 CTA를 갖는다', () => {
        const { onClose } = renderSheet();

        expect(screen.getByText('phoneVerify.sheetTitle')).toBeInTheDocument();
        expect(screen.getByText('phoneVerify.complete')).toBeInTheDocument();
        expect(screen.getAllByText('phoneVerify.sheetDescription')).toHaveLength(2);

        fireEvent.click(screen.getByLabelText('common.close'));
        expect(onClose).toHaveBeenCalled();
    });

    it('shows a retry instead of completing when the session switch failed, without proving the spent code again', async () => {
        mockConfirmPhoneLogin.mockRejectedValueOnce(
            Object.assign(new Error('switch failed'), { code: 'PHONE_LOGIN_SWITCH_FAILED' })
        );

        const { onVerified } = renderSheet();
        await requestCode();
        await pasteOtp();

        expect(screen.getByText('phoneVerify.retry')).toBeInTheDocument();
        expect(onVerified).not.toHaveBeenCalled();
        expect(mockConfirmPhoneLogin).toHaveBeenCalledTimes(1);
    });

    it('sends with the login mode and signs in through the runtime on the sixth digit', async () => {
        mockConfirmPhoneLogin.mockResolvedValueOnce({ isNew: false });

        const { onVerified } = renderSheet('login');
        await requestCode();
        await pasteOtp();

        expect(mockSend).toHaveBeenCalledWith(PHONE_E164, { mode: 'login', code: undefined, countryCode: 'KR' });
        expect(mockConfirmPhoneLogin).toHaveBeenCalledWith(PHONE_E164, '123456', { countryCode: 'KR' });
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
        expect(mockConfirmPhoneLogin).not.toHaveBeenCalled();
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
