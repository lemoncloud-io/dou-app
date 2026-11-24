import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { useNavigateWithTransition } from '@chatic/shared';
import { IconBack, IconButton, ModalTopBar, ScreenLayout } from '@chatic/web-ui-kit';

import { subscriptionKeys } from '../../../hooks/queryKeys';

export const SHELL_CHECKOUT_ROUTE = 'shell-checkout';
export const SHELL_CHECKOUT_PATH = `/subscription/${SHELL_CHECKOUT_ROUTE}`;

const checkoutAddress = (value: string | null): string | null => {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
    } catch {
        return null;
    }
};

export const ShellCheckoutPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const queryClient = useQueryClient();
    const [params] = useSearchParams();
    const src = checkoutAddress(params.get('url'));

    // ratchet-allow useEffect -- reads the membership again when the window regains focus and when this screen is left
    useEffect(() => {
        const reread = () => void queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
        window.addEventListener('focus', reread);
        return () => {
            window.removeEventListener('focus', reread);
            reread();
        };
    }, [queryClient]);

    return (
        <ScreenLayout
            header={
                <ModalTopBar
                    safeArea
                    title={t('mypage.subscription.shellCheckout.title')}
                    leftSlot={
                        <IconButton
                            icon={<IconBack className="size-[26px]" />}
                            label={t('common.back')}
                            onClick={() => navigate(-1)}
                        />
                    }
                />
            }
        >
            {src ? (
                <iframe
                    title={t('mypage.subscription.shellCheckout.title')}
                    src={src}
                    allow="payment"
                    className="h-full min-h-[calc(100dvh-56px)] w-full border-0"
                />
            ) : (
                <p role="alert" className="px-4 py-6 text-[15px] text-muted-foreground">
                    {t('mypage.subscription.shellCheckout.noAddress')}
                </p>
            )}
        </ScreenLayout>
    );
};
