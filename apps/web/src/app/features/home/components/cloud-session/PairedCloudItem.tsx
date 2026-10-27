import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { CloudAvatar, IconCheckCircleSolid } from '@chatic/web-ui-kit';

import { SELECTED_HIGHLIGHT } from './shared';

interface PairedCloudItemProps {
    cloudId: string;
    /** The cloud's name when this browser has read it (from inside the cloud); else a short id stands in. */
    name?: string;
    isSelected: boolean;
    isDisabled: boolean;
    onSelectCloud: (cloudId: string) => void;
}

/**
 * A cloud this guest browser entered through a pairing. A guest cannot read the cloud catalog, so
 * the name is only known once the browser has been inside the cloud; before that the row shows the
 * cloud's id, shortened — the one fact about it the browser has.
 */
export const PairedCloudItem = ({ cloudId, name, isSelected, isDisabled, onSelectCloud }: PairedCloudItemProps) => {
    const { t } = useTranslation();
    const displayName = name?.trim() || t('pairing.cloud.unnamed', { id: cloudId.slice(-6) });
    const disabled = isDisabled || isSelected;

    return (
        <button
            onClick={() => !disabled && onSelectCloud(cloudId)}
            disabled={disabled}
            data-testid={`paired-cloud-${cloudId}`}
            className={cn(
                'flex w-full items-center gap-3 rounded-xl px-2 py-2 transition-colors',
                isSelected && SELECTED_HIGHLIGHT,
                disabled && !isSelected && 'cursor-not-allowed opacity-60'
            )}
        >
            <CloudAvatar name={displayName} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                <span className="truncate text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                    {displayName}
                </span>
                <span className="truncate text-[14px] leading-[1.19] tracking-[-0.01em] text-description">
                    {t('pairing.cloud.pairedLabel')}
                </span>
            </div>
            {isSelected && <IconCheckCircleSolid size={28} className="shrink-0 text-primary" />}
        </button>
    );
};
