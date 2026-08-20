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

describe('EmailVerifyDialog — skip affordance', () => {
    it('has no skip link when the caller does not supply onSkip (e.g. adding a cloud)', () => {
        render(<EmailVerifyDialog open onOpenChange={noop} onVerified={noop} verifyEmail={() => Promise.resolve()} />);
        expect(screen.queryByText('addAccount.emailSkip')).not.toBeInTheDocument();
    });

    it('offers a skip link when the caller supplies onSkip (e.g. purchasing a plan)', () => {
        const onSkip = jest.fn();
        const onOpenChange = jest.fn();
        render(
            <EmailVerifyDialog
                open
                onOpenChange={onOpenChange}
                onVerified={noop}
                onSkip={onSkip}
                verifyEmail={() => Promise.resolve()}
            />
        );

        const skipLink = screen.getByText('addAccount.emailSkip');
        skipLink.click();

        expect(onSkip).toHaveBeenCalledTimes(1);
        // Skipping closes the dialog the same way the close (X) affordance does.
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });
});

describe('EmailVerifyDialog — binding an existing cloud (cloudId)', () => {
    it('checks only, with no cloudId — nothing to bind, the caller attaches the email itself', async () => {
        const verifyEmail = jest.fn().mockResolvedValue(undefined);
        const onVerified = jest.fn();
        render(<EmailVerifyDialog open onOpenChange={noop} onVerified={onVerified} verifyEmail={verifyEmail} />);

        await enterEmailAndCode();

        expect(verifyEmail).toHaveBeenCalledWith({ email: EMAIL, step: 'send' });
        expect(verifyEmail).toHaveBeenCalledWith({ email: EMAIL, step: 'check', code: CODE });
        expect(verifyEmail).not.toHaveBeenCalledWith(expect.objectContaining({ step: 'confirm' }));
        expect(onVerified).toHaveBeenCalledWith(EMAIL);
    });

    it('chains a confirm call after check when cloudId is supplied — check alone does not bind', async () => {
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
