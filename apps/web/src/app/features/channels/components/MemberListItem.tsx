import { useTranslation } from 'react-i18next';

import { Check, MoreHorizontal, User } from 'lucide-react';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

interface Member {
    id: string;
    name: string;
    avatar?: string | null;
}

interface MemberListItemProps {
    member: Member;
    isMe?: boolean;
    isOwner?: boolean;
    isPendingInvite?: boolean;
    showActions?: boolean;
    onReport?: () => void;
    onBlock?: () => void;
}

export const MemberListItem = ({
    member,
    isMe = false,
    isOwner = false,
    isPendingInvite = false,
    showActions = false,
    onReport,
    onBlock,
}: MemberListItemProps) => {
    const { t } = useTranslation();

    return (
        <div className="flex items-center gap-2">
            {/* Avatar */}
            <div
                className={`relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted ${
                    isPendingInvite ? 'border-dashed border-muted-foreground/50' : 'border-solid border-border'
                }`}
            >
                {member.avatar ? (
                    <img
                        src={member.avatar}
                        alt={member.name}
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover"
                    />
                ) : (
                    <User className={`size-3.5 ${isPendingInvite ? 'text-muted-foreground' : 'text-foreground'}`} />
                )}
            </div>

            {/* Name & Badges */}
            <div className="flex flex-1 items-center gap-1">
                <span
                    className={`text-[16px] font-medium leading-[22px] tracking-[0.08px] ${
                        isPendingInvite ? 'text-muted-foreground' : 'text-foreground'
                    }`}
                >
                    {member.name}
                </span>

                {/* Owner Badge (green checkmark) */}
                {isOwner && !isMe && (
                    <div className="flex size-[19px] items-center justify-center rounded bg-[#B0EA10] p-0.5 shadow-[0px_1px_3px_0px_rgba(0,0,0,0.16)]">
                        <Check className="size-[15px] text-white" strokeWidth={3} />
                    </div>
                )}

                {/* MY Badge */}
                {isMe && (
                    <span className="rounded-[3px] bg-[#102346] px-[5px] py-[3px] text-[11px] font-medium leading-none text-white">
                        MY
                    </span>
                )}
            </div>

            {/* More Menu */}
            {showActions && !isMe && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="flex items-center justify-center p-1">
                            <MoreHorizontal size={20} className="text-muted-foreground" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="end"
                        className="w-[160px] rounded-[12px] shadow-[0px_0px_6px_0px_rgba(0,0,0,0.13)]"
                    >
                        <DropdownMenuItem onClick={onReport} className="cursor-pointer px-[16px] py-[11px]">
                            <span className="text-[16px]">{t('chat.settings.report')}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={onBlock}
                            className="cursor-pointer px-[16px] py-[11px] text-destructive focus:text-destructive"
                        >
                            <span className="text-[16px]">{t('chat.settings.block')}</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    );
};
