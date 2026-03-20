import { ChevronLeft, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { DouLogo } from '../../signup/components/DouLogo';
import { FloatingButton } from '../../signup/components/FloatingButton';

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const ResetPasswordEmailPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const [email, setEmail] = useState('');
    const [touched, setTouched] = useState(false);
    const [loading, setLoading] = useState(false);

    const hasError = touched && email.length > 0 && !isValidEmail(email);
    const isValid = isValidEmail(email);
    const showClear = email.length > 0;

    const MOCK_VALID_EMAILS = ['app@lemoncloud.io', 'developer@lemoncloud.io'];

    const handleVerify = async () => {
        setLoading(true);
        // TODO: Call send reset password verification code API
        await new Promise(resolve => setTimeout(resolve, 1000));
        setLoading(false);

        if (!MOCK_VALID_EMAILS.includes(email)) {
            toast({ title: t('resetPassword.accountNotFound'), variant: 'destructive' });
            return;
        }
        navigate('/reset-password/verify', { replace: true });
    };

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <header className="flex items-center px-[6px]">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-none px-4 pb-[120px]">
                <div className="mt-[24px] flex flex-col items-center gap-[46px]">
                    <DouLogo />

                    <div className="flex w-full flex-col gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-[14px] font-semibold text-[#53555B]">
                                {t('resetPassword.emailLabel')}
                            </label>
                            <div className="relative">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    onBlur={() => setTouched(true)}
                                    placeholder={t('resetPassword.emailPlaceholder')}
                                    className={cn(
                                        'w-full rounded-[10px] border bg-white p-3 px-4 pr-10 text-[16px] text-black outline-none transition-colors placeholder:text-[#BABCC0] dark:bg-background dark:text-white',
                                        hasError
                                            ? 'border-[1.5px] border-[#FF4C35]'
                                            : 'border-[#EAEAEC] focus:border-[1.5px] focus:border-[#3A3C40] dark:border-[#3A3C40]'
                                    )}
                                />
                                {showClear && (
                                    <button
                                        type="button"
                                        onClick={() => setEmail('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#BABCC0]"
                                    >
                                        <XCircle size={20} fill="currentColor" stroke="white" />
                                    </button>
                                )}
                            </div>
                            <p className={cn('pl-[2px] text-[12px]', hasError ? 'text-[#FF4C35]' : 'text-[#84888F]')}>
                                {t('resetPassword.emailDescription')}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <FloatingButton
                label={t('resetPassword.sendCode')}
                disabled={!isValid}
                loading={loading}
                onClick={handleVerify}
            />
        </div>
    );
};
