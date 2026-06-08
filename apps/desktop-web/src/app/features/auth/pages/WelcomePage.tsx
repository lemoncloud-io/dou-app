import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';

import { AuthCard } from '../components';
import { useGuestLogin } from '../hooks/useGuestLogin';

/**
 * First-run landing. Offers a one-tap guest start (device-register into the
 * Default Cloud's Self Channel) plus a secondary path for users who hold an
 * Invite Code. Replaces the invite-only gate as the default unauthenticated screen.
 */
export const WelcomePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { submit, isSubmitting, isError } = useGuestLogin();

    return (
        <AuthCard title={t('welcome.title')} subtitle={t('welcome.subtitle')}>
            {isError && <p className="-mt-2 text-sm text-destructive">{t('welcome.registerFailed')}</p>}

            <div className="flex flex-col gap-2">
                <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={isSubmitting}
                    className={cn(
                        'h-11 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-all',
                        'hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100'
                    )}
                >
                    {isSubmitting ? t('welcome.starting') : isError ? t('welcome.retry') : t('welcome.start')}
                </button>
                <button
                    type="button"
                    onClick={() => navigate('/auth/login')}
                    disabled={isSubmitting}
                    className="h-11 rounded-full border border-border text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                    {t('welcome.haveInvite')}
                </button>
            </div>
        </AuthCard>
    );
};
