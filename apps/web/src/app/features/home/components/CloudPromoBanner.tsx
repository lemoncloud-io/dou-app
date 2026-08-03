import { useTranslation } from 'react-i18next';

import { PromoBanner, myCloudIllustration } from '@chatic/web-ui-kit';

import { useCloudPromo } from '../hooks/useCloudPromo';

interface CloudPromoBannerProps {
    /**
     * Supplies the inline "클라우드 추가" link. Omit it in the cloud-switcher sheet, which already
     * has an add button in its section footer.
     */
    onAddCloud?: () => void;
    className?: string;
}

/**
 * "Add a cloud" promo banner — shown on the relay home and in the switcher's empty "내 클라우드"
 * section. Renders nothing once the account owns a cloud or while a dismissal is still within its
 * 24h window; both surfaces share that decision via useCloudPromo (ADR-0034).
 */
export const CloudPromoBanner = ({ onAddCloud, className }: CloudPromoBannerProps) => {
    const { t } = useTranslation();
    const { isVisible, dismiss } = useCloudPromo();

    if (!isVisible) return null;

    return (
        <PromoBanner
            icon={<img src={myCloudIllustration} alt="" className="size-12" />}
            title={t('cloudPromo.title')}
            actionLabel={onAddCloud ? t('cloudPromo.action') : undefined}
            onAction={onAddCloud}
            onDismiss={dismiss}
            dismissLabel={t('cloudPromo.dismiss')}
            className={className}
        />
    );
};
