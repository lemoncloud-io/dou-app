import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

const mockSend = jest.fn();
const mockCheck = jest.fn();
const mockApplySessionToken = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/app-runtime', () => ({
    applySessionToken: (...args: unknown[]) => mockApplySessionToken(...args),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('../../../hooks/useVerifyHashAlias', () => ({
    useVerifyHashAlias: () => ({ send: mockSend, check: mockCheck, isSending: false, isChecking: false }),
}));
jest.mock('../utils/env', () => ({ isDevBuild: () => false }));

import { PhoneVerifySheet } from './PhoneVerifySheet';

const PHONE = '01012345678';

const renderSheet = () => {
    const props = { onVerified: jest.fn(), onClose: jest.fn() };
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

describe('PhoneVerifySheet', () => {
    beforeEach(() => jest.clearAllMocks());

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
        mockCheck.mockResolvedValueOnce({ attached: true, $token });
        mockApplySessionToken.mockRejectedValueOnce(new Error('relay re-auth not confirmed'));

        const { onVerified } = renderSheet();
        await requestCode();
        await act(async () => {
            fireEvent.change(screen.getByPlaceholderText('phoneVerify.codePlaceholder'), {
                target: { value: '123456' },
            });
        });

        expect(screen.getByText('phoneVerify.retry')).toBeInTheDocument();
        expect(onVerified).not.toHaveBeenCalled();
        expect(mockCheck).toHaveBeenCalledTimes(1);
    });
});
