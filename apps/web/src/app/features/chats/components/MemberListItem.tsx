import { Check, User } from 'lucide-react';

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
}

export const MemberListItem = ({
    member,
    isMe = false,
    isOwner = false,
    isPendingInvite = false,
}: MemberListItemProps) => {
    return (
        <div className="flex items-center gap-2">
            {/* Avatar */}
            <div
                className={`relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border ${
                    isPendingInvite ? 'border-dashed border-[#CFD0D3]' : 'border-solid border-[#F4F5F5]'
                } bg-[rgba(0,43,126,0.04)]`}
            >
                {member.avatar ? (
                    <img src={member.avatar} alt={member.name} className="size-full object-cover" />
                ) : (
                    <User className={`size-3.5 ${isPendingInvite ? 'text-[#9FA2A7]' : 'text-[#3A3C40]'}`} />
                )}
            </div>

            {/* Name & Badges */}
            <div className="flex flex-1 items-center gap-1">
                <span
                    className={`text-[16px] font-medium leading-[22px] tracking-[0.08px] ${
                        isPendingInvite ? 'text-[#9FA2A7]' : 'text-[#222325]'
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
                    <div className="rounded bg-[#102346] px-[5px] py-[3px]">
                        <span className="text-[11px] font-medium leading-none text-white">MY</span>
                    </div>
                )}
            </div>
        </div>
    );
};
