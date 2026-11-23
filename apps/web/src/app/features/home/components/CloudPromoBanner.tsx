import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { PromoBanner, myCloudIllustration } from '@chatic/web-ui-kit';

import { useCloudPromo } from '../hooks/useCloudPromo';

interface CloudPromoBannerProps {
    hasOwnedCloud: boolean;
    onAddCloud?: () => void;
    className?: string;
}

export const CloudPromoBanner = ({ hasOwnedCloud, onAddCloud, className }: CloudPromoBannerProps) => {
    const { t } = useTranslation();
    const { isVisible, dismiss } = useCloudPromo({ hasOwnedCloud });

    if (!isVisible) return null;

    return (
        <div className={cn('px-4', className)}>
            <PromoBanner
                icon={<img src={myCloudIllustration} alt="" className="size-12" />}
                title={t('cloudPromo.title')}
                actionLabel={onAddCloud ? t('cloudPromo.action') : undefined}
                onAction={onAddCloud}
                onDismiss={dismiss}
                dismissLabel={t('cloudPromo.dismiss')}
            />
        </div>
    );
};
