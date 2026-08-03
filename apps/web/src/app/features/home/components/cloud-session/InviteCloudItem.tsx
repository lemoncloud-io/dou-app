import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { CloudAvatar, IconCheckCircleSolid } from '@chatic/web-ui-kit';
import type { DomainCloud } from '@chatic/data';

import { SELECTED_HIGHLIGHT } from './shared';

interface InviteCloudItemProps {
    inviteCloud: DomainCloud;
    isSelected: boolean;
    isDisabled: boolean;
    /** presence dot: any unread across this cloud's places (last-visited snapshot). */
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
    const displayName = inviteCloud.name ?? inviteCloud.cid ?? '';
    // Owner-name guide text (spec 5-3). The invite-accept flow does not yet persist the owner, so
    // fall back to a generic "invited cloud" label when it is absent.
    const ownerName = inviteCloud.owner$?.name;
    const subtitle = ownerName
        ? t('cloudSessionSheet.invitedOwnerLabel', { owner: ownerName })
        : t('cloudSessionSheet.invitedFallbackLabel');
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
            {/* Owner's representative avatar — AppHeader-style initials avatar derived from the
                cloud name (no image field exists in the model). */}
            <CloudAvatar name={displayName} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-[6px]">
                    <span className="truncate text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                        {displayName}
                    </span>
                    {hasUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
                </div>
                <span className="truncate text-left text-[14px] font-normal leading-[1.19] tracking-[-0.01em] text-description">
                    {subtitle}
                </span>
            </div>
            {/* Same trailing lime disc as the owned rows — this row was still on the old leading
                purple check that ADR-0014 replaced everywhere else. */}
            {isSelected && <IconCheckCircleSolid size={28} className="shrink-0 text-primary" />}
        </button>
    );
};
