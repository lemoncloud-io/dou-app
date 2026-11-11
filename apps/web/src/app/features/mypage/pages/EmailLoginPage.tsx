import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { runtime } from '@chatic/app-runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { FloatingButton, TextField } from '@chatic/web-ui-kit';
import { logger } from '@chatic/bridges';

import { KeyboardAwareLayout } from '../../../ui/layouts';
import { readHistoryIndex } from '../../../navigation';
import { ROUTES } from '../../../routes/paths';
import { isValidEmail } from '../../../utils';
import { DouLogo } from '../../account/components';
import type { LoginLocationState } from '../../auth/hooks/useNavigateToLogin';

const FORM_ID = 'email-login-form';

/**
 * Email + password sign-in on its own screen, reached from the login screen on development stages
 * (`feature.auth.emailLogin`). Laid out like the account screens: back chevron, logo, labelled
 * fields, and the action pinned to the bottom.
 *
 * It sits one entry above the login screen, so leaving goes back TWO entries to land where the user
 * started — going back one would just show the login screen again. Without a `returnTo` or a deep
 * enough stack (reload, deep link) it falls back to home. The password never reaches a log line.
 */
export const EmailLoginPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const location = useLocation();
    const navigate = useNavigateWithTransition();
    const { mutateAsync: login, isPending } = runtime.session.useLogin();
    const [uid, setUid] = useState('');
    const [pwd, setPwd] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const canSubmit = isValidEmail(uid) && pwd.length > 0;

    const leave = () => {
        const { returnTo } = (location.state ?? {}) as LoginLocationState;
        const wentBack = !!returnTo && (readHistoryIndex() ?? 0) >= 2;
        logger.info('AUTH', `leaving email login — ${wentBack ? 'back to origin' : 'fallback to home'}`);
        const leaving = wentBack
            ? navigate(-2)
            : navigate(ROUTES.home, { replace: true, transition: true, direction: 'back' });
        void Promise.resolve(leaving).catch(error =>
            logger.error('AUTH', '[EmailLoginPage] Failed to leave the email login screen', { error })
        );
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!canSubmit || isPending) return;
        try {
            await login({ uid, pwd });
            setPwd('');
            leave();
        } catch (error) {
            logger.error('AUTH', '[EmailLoginPage] email login failed', { error });
            toast({
                title: t('mypageLogin.error'),
                description: t('mypageLogin.errorDescription'),
                variant: 'destructive',
            });
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
                    type="submit"
                    form={FORM_ID}
                    label={t('mypageLogin.submit')}
                    disabled={!canSubmit}
                    loading={isPending}
                    data-testid="login-email-submit"
                />
            }
        >
            <form id={FORM_ID} onSubmit={handleSubmit} className="mt-[24px] flex flex-col items-center gap-[46px]">
                <DouLogo />

                <div className="flex w-full flex-col gap-5">
                    <TextField
                        type="email"
                        label={t('mypageLogin.emailLabel')}
                        placeholder={t('mypageLogin.emailPlaceholder')}
                        value={uid}
                        onChange={setUid}
                        autoComplete="username"
                    />
                    <TextField
                        type={showPassword ? 'text' : 'password'}
                        label={t('mypageLogin.passwordLabel')}
                        placeholder={t('mypageLogin.passwordPlaceholder')}
                        value={pwd}
                        onChange={setPwd}
                        autoComplete="current-password"
                        trailing={
                            <button
                                type="button"
                                onClick={() => setShowPassword(prev => !prev)}
                                className="text-placeholder"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                            </button>
                        }
                    />
                </div>
            </form>
        </KeyboardAwareLayout>
    );
};
