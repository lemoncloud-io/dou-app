import { ChevronLeft, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { useNavigateWithTransition } from '@chatic/shared';

import { KeyboardAwareLayout } from '../../../shared/layouts';
import { DouLogo } from './DouLogo';
import { FloatingButton } from './FloatingButton';

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

interface EmailInputPageProps {
    translationPrefix: string;
    buttonLabelKey?: string;
    onSubmit: (email: string) => Promise<boolean>;
}

export const EmailInputPage = ({
    translationPrefix,
    buttonLabelKey = 'emailVerify',
    onSubmit,
}: EmailInputPageProps) => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const [email, setEmail] = useState('');
    const [touched, setTouched] = useState(false);
    const [loading, setLoading] = useState(false);

    const hasError = touched && email.length > 0 && !isValidEmail(email);
    const isValid = isValidEmail(email);

    const handleVerify = async () => {
        setLoading(true);
        try {
            const success = await onSubmit(email);
            if (!success) return;
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAwareLayout
            header={
                <header className="flex items-center px-[6px]">
                    <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                        <ChevronLeft size={26} strokeWidth={2} />
                    </button>
                </header>
            }
            footer={
                <FloatingButton
                    label={t(`${translationPrefix}.${buttonLabelKey}`)}
                    disabled={!isValid}
                    loading={loading}
                    onClick={handleVerify}
                />
            }
        >
            <div className="px-4">
                <div className="mt-[24px] flex flex-col items-center gap-[46px]">
                    <DouLogo />

                    <div className="flex w-full flex-col gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-[14px] font-semibold text-[#53555B] dark:text-muted-foreground">
                                {t(`${translationPrefix}.emailLabel`)}
                            </label>
                            <div className="relative">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    onBlur={() => setTouched(true)}
                                    placeholder={t(`${translationPrefix}.emailPlaceholder`)}
                                    className={cn(
                                        'w-full rounded-[10px] border bg-white p-3 px-4 pr-10 text-[16px] text-black outline-none transition-colors placeholder:text-[#BABCC0] dark:bg-background dark:text-white',
                                        hasError
                                            ? 'border-[1.5px] border-[#FF4C35]'
                                            : 'border-[#EAEAEC] focus:border-[1.5px] focus:border-[#3A3C40] dark:border-[#3A3C40]'
                                    )}
                                />
                                {email.length > 0 && (
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
                                {t(`${translationPrefix}.emailDescription`)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </KeyboardAwareLayout>
    );
};
