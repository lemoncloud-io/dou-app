import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { CloudAvatar, IconCheckCircleSolid } from '@chatic/web-ui-kit';
import type { DomainCloud } from '@chatic/runtime-react';

import { CloudUnreadBadge } from './CloudUnreadBadge';
import { SELECTED_HIGHLIGHT } from './shared';

interface InviteCloudItemProps {
    inviteCloud: DomainCloud;
    isSelected: boolean;
    isDisabled: boolean;
    hasUnread?: boolean;
    onSelectCloud: (cloudId: string) => void;
}

export const InviteCloudItem = ({
    inviteCloud,
    isSelected,
    isDisabled,
    hasUnread,
    onSelectCloud,
}: InviteCloudItemProps) => {
    const { t } = useTranslation();
    const ownerName = inviteCloud.owner$?.name;
    const ownerLabel = ownerName
        ? t('cloudSessionSheet.invitedOwnerLabel', { owner: ownerName })
        : t('cloudSessionSheet.invitedFallbackLabel');
    const cloudName = inviteCloud.name?.trim();
    const displayName = cloudName || ownerLabel;
    const subtitle = cloudName ? ownerLabel : null;
    const disabled = isDisabled || isSelected;

    return (
        <button
            onClick={() => {
                if (!disabled && inviteCloud.cid) onSelectCloud(inviteCloud.cid);
            }}
            disabled={disabled}
            className={cn(
                'flex w-full items-center gap-3 rounded-xl px-2 py-2 transition-colors',
                isSelected && SELECTED_HIGHLIGHT,
                disabled && !isSelected && 'cursor-not-allowed opacity-60'
            )}
        >
            <CloudAvatar name={displayName} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex min-w-0 items-center gap-[6px]">
                    <span className="truncate text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                        {displayName}
                    </span>
                    {hasUnread && <CloudUnreadBadge />}
                </div>
                {subtitle && (
                    <span className="truncate text-left text-[14px] font-normal leading-[1.19] tracking-[-0.01em] text-description">
                        {subtitle}
                    </span>
                )}
            </div>
            {isSelected && <IconCheckCircleSolid size={28} className="shrink-0 text-primary" />}
        </button>
    );
};
