import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { PromoBanner, myCloudIllustration } from '@chatic/web-ui-kit';

import { useCloudPromo } from '../hooks/useCloudPromo';

interface CloudPromoBannerProps {
    /**
     * Whether the account owns a cloud. Passed in — not fetched here — so this conditionally
     * rendered component never subscribes to the `refetchOnMount: 'always'` cloud query; see
     * useCloudPromo for the shimmer loop that causes. Invited clouds do not count.
     */
    hasOwnedCloud: boolean;
    /**
     * Supplies the inline "클라우드 추가" link. Omit it in the cloud-switcher sheet, which already
     * has an add button in its section footer.
     */
    onAddCloud?: () => void;
    /** Applied to the padding wrapper, not the card — see the gutter note below. */
    className?: string;
}

/**
 * "Add a cloud" promo banner — shown on the relay home and in the switcher's empty "내 클라우드"
 * section. Renders nothing once the account owns a cloud or while a dismissal is still within its
 * 24h window; both surfaces share that decision via useCloudPromo (ADR-0034).
 *
 * The horizontal gutter is PADDING on this wrapper, never a margin on the card. `PromoBanner` is
 * `w-full`, so a margin would add to a full-width box and push the page into a horizontal scroll.
 * Wrapping is safe here precisely because this component returns null when hidden — there is no
 * empty box left behind.
 */
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
