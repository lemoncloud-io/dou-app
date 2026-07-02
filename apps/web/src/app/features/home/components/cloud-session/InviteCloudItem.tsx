import { Check, User } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import type { DomainCloud } from '@chatic/data';

import { CLOUD_AVATAR_CLASS, SELECTED_HIGHLIGHT } from './shared';

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
    const displayName = inviteCloud.name ?? inviteCloud.id ?? '';
    const disabled = isDisabled || isSelected;

    return (
        <button
            onClick={() => {
                if (!disabled && inviteCloud.id) onSelectCloud(inviteCloud.id);
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
                <div className={CLOUD_AVATAR_CLASS}>
                    <User size={16} className="text-placeholder" />
                </div>
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-[6px]">
                        <span className="text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                            {displayName}
                        </span>
                        {hasUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
                    </div>
                    <span className="text-left text-[14px] font-normal leading-[1.19] tracking-[-0.01em] text-[#9FA2A7]">
                        ID: {inviteCloud.id}
                    </span>
                </div>
            </div>
        </button>
    );
};
