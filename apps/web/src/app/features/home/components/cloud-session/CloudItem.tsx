import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import {
    CloudAvatar,
    CloudStatusBadge,
    type CloudStatusVariant,
    IconCheckCircleSolid,
    IconChevronRight,
    IconSpinner,
} from '@chatic/web-ui-kit';
import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { type CloudRowState, isCloudEnterable, needsCloudAttention, resolveCloudRowState } from '../../../../utils';
import { CloudUnreadBadge } from './CloudUnreadBadge';
import { SELECTED_HIGHLIGHT, getCloudDisplayName } from './shared';

const BADGE: Record<CloudRowState, { variant: CloudStatusVariant; key: string } | null> = {
    provisioning: { variant: 'provisioning', key: 'statusProvisioning' },
    setupFailed: { variant: 'failed', key: 'statusFailed' },
    dropScheduled: { variant: 'ending', key: 'statusEnding' },
    restricted: { variant: 'restricted', key: 'statusRestricted' },
    released: null,
    ready: null,
};

interface CloudItemProps {
    cloud: CloudView;
    isSelected: boolean;
    isDisabled: boolean;
    hasUnread?: boolean;
    onSelectCloud: (cloudId: string) => void;
    onInspectCloud: (cloudId: string) => void;
}

export const CloudItem = ({
    cloud,
    isSelected,
    isDisabled,
    hasUnread,
    onSelectCloud,
    onInspectCloud,
}: CloudItemProps) => {
    const { t } = useTranslation();
    const state = resolveCloudRowState(cloud);
    const enterable = isCloudEnterable(state);
    const attention = needsCloudAttention(state);
    const badge = BADGE[state];
    const isRestricted = state === 'restricted';
    const displayName = getCloudDisplayName(cloud);
    const hasName = !!displayName;
    const disabled = isDisabled || isSelected;

    const handleClick = () => {
        if (disabled || !cloud.id) return;
        if (!enterable) {
            onInspectCloud(cloud.id);
            return;
        }
        onSelectCloud(cloud.id);
    };

    return (
        <button
            onClick={handleClick}
            disabled={disabled}
            className={cn(
                'flex w-full items-center gap-3 rounded-xl px-2 py-2 transition-colors',
                isSelected && SELECTED_HIGHLIGHT,
                isRestricted && 'bg-secondary',
                disabled && !isSelected && 'cursor-not-allowed opacity-60'
            )}
        >
            <CloudAvatar name={displayName} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {hasName ? (
                    <div className="flex min-w-0 items-center gap-[6px]">
                        <span
                            className={cn(
                                'truncate text-[15px] font-medium leading-[1.19] tracking-[-0.02em]',
                                isRestricted ? 'text-placeholder' : 'text-foreground'
                            )}
                        >
                            {displayName}
                        </span>
                        {hasUnread && <CloudUnreadBadge />}
                    </div>
                ) : (
                    <div className="flex items-center gap-[6px]">
                        <span className="text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                            {t('cloudSessionSheet.setupProfile')}
                        </span>
                    </div>
                )}
                {attention && (
                    <span
                        className={cn(
                            'truncate text-left text-[13px] leading-[1.4] tracking-[-0.065px]',
                            isRestricted ? 'text-placeholder' : 'text-description'
                        )}
                    >
                        {t('cloudSessionSheet.checkInfo')}
                    </span>
                )}
            </div>
            <span className="flex shrink-0 items-center gap-1.5">
                {state === 'provisioning' && <IconSpinner className="size-5 animate-spin text-point-blue" />}
                {badge && <CloudStatusBadge variant={badge.variant} label={t(`cloudSessionSheet.${badge.key}`)} />}
                {isSelected ? (
                    <IconCheckCircleSolid size={28} className="text-primary" />
                ) : (
                    !enterable && <IconChevronRight className="size-[18px] text-description" />
                )}
            </span>
        </button>
    );
};
