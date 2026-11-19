import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

import { EmailVerifyDialog } from './EmailVerifyDialog';

const noop = () => undefined;
const EMAIL = 'user@example.com';
const CODE = '123456';

/** Fills the address, sends the code, then types it in — the last digit auto-submits `verify()`. */
const enterEmailAndCode = async () => {
    fireEvent.change(screen.getByPlaceholderText('addAccount.emailPlaceholder'), { target: { value: EMAIL } });
    await act(async () => fireEvent.click(screen.getByText('addAccount.sendCode')));
    await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('addAccount.verificationDescription'), {
            target: { value: CODE },
        });
    });
};

describe('EmailVerifyDialog — binding the cloud', () => {
    it('chains a confirm call after check — check alone does not bind', async () => {
        const verifyEmail = jest.fn().mockResolvedValue(undefined);
        const onVerified = jest.fn();
        render(
            <EmailVerifyDialog
                open
                onOpenChange={noop}
                onVerified={onVerified}
                cloudId="CLOUD1"
                verifyEmail={verifyEmail}
            />
        );

        await enterEmailAndCode();

        expect(verifyEmail).toHaveBeenCalledWith({ email: EMAIL, step: 'check', code: CODE });
        expect(verifyEmail).toHaveBeenCalledWith({ email: EMAIL, step: 'confirm', cloudId: 'CLOUD1' });
        // confirm only runs once check has resolved.
        const steps = verifyEmail.mock.calls.map(([request]) => request.step);
        expect(steps.indexOf('confirm')).toBeGreaterThan(steps.indexOf('check'));
        expect(onVerified).toHaveBeenCalledWith(EMAIL);
    });

    it('does not call onVerified when confirm rejects — the address was checked but never bound', async () => {
        const verifyEmail = jest
            .fn()
            .mockImplementation(({ step }) =>
                step === 'confirm' ? Promise.reject(new Error('confirm failed')) : Promise.resolve()
            );
        const onVerified = jest.fn();
        render(
            <EmailVerifyDialog
                open
                onOpenChange={noop}
                onVerified={onVerified}
                cloudId="CLOUD1"
                verifyEmail={verifyEmail}
            />
        );

        await enterEmailAndCode();

        expect(onVerified).not.toHaveBeenCalled();
        expect(screen.getByText('addAccount.codeError')).toBeInTheDocument();
    });
});
