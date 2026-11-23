import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { STORE_URLS } from '@chatic/shared';

import type { TranslationKey } from '../../../locales/en';

export type MobileAppPointerKey = Extract<TranslationKey, `mobileApp.${string}`>;

interface MobileAppPointerProps {
    messageKey?: MobileAppPointerKey;
    className?: string;
}

export const MobileAppPointer = ({ messageKey = 'mobileApp.planAndCloud', className }: MobileAppPointerProps) => {
    const { t } = useTranslation();
    return (
        <p className={cn('text-caption text-muted-foreground', className)}>
            {t(messageKey)}{' '}
            <span className="whitespace-nowrap">
                <StoreLink href={STORE_URLS.ios} label={t('mobileApp.appStore')} />
                <span aria-hidden> · </span>
                <StoreLink href={STORE_URLS.android} label={t('mobileApp.googlePlay')} />
            </span>
        </p>
    );
};

const StoreLink = ({ href, label }: { href: string; label: string }) => (
    <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="focus-ring rounded-sm underline underline-offset-2 hover:decoration-2"
    >
        {label}
    </a>
);
