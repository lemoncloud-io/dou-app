import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { STORE_URLS } from '@chatic/shared';

import type { TranslationKey } from '../../../locales/en';

/** The sentences a pointer may say; each names something only the mobile app does. */
export type MobileAppPointerKey = Extract<TranslationKey, `mobileApp.${string}`>;

interface MobileAppPointerProps {
    /** What the mobile app is for here. Defaults to subscriptions and new clouds. */
    messageKey?: MobileAppPointerKey;
    className?: string;
}

/**
 * Desktop sells nothing and creates no clouds: subscriptions, new clouds, inviting someone new and
 * starting a 1:1 on Home all happen in the DoU mobile app. Every spot where one of those is the
 * answer says so with this line and the two store links, instead of leaving a dead end. The links
 * open in the system browser (the shell hands every external `_blank` link to the OS).
 */
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
        // The line's own color, so the pointer reads on a destructive toast as well as on a page.
        className="focus-ring rounded-sm underline underline-offset-2 hover:decoration-2"
    >
        {label}
    </a>
);
