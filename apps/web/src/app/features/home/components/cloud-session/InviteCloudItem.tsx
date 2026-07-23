import { useTranslation } from 'react-i18next';

import { Check } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { CloudAvatar } from '@chatic/web-ui-kit';
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
                'flex w-full items-center gap-[5px] rounded-xl px-2 py-2 transition-colors',
                isSelected && SELECTED_HIGHLIGHT,
                disabled && !isSelected && 'cursor-not-allowed opacity-60'
            )}
        >
            <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center">
                {isSelected && <Check size={22} className="text-[#C139E3]" strokeWidth={2} />}
            </div>
            <div className="flex flex-1 items-center gap-3 pr-[6px]">
                {/* Owner's representative avatar — AppHeader-style initials avatar derived from the
                    cloud name (no image field exists in the model). */}
                <CloudAvatar name={displayName} size="lg" />
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-[6px]">
                        <span className="text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                            {displayName}
                        </span>
                        {hasUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
                    </div>
                    <span className="text-left text-[14px] font-normal leading-[1.19] tracking-[-0.01em] text-[#9FA2A7]">
                        {subtitle}
                    </span>
                </div>
            </div>
        </button>
    );
};
