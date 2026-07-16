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
    /** When set, the row becomes a button that opens the member profile. */
    onClick?: () => void;
}

export const MemberListItem = ({
    member,
    isMe = false,
    isOwner = false,
    isPendingInvite = false,
    onClick,
}: MemberListItemProps) => {
    const Root = onClick ? 'button' : 'div';
    return (
        <Root
            {...(onClick ? { type: 'button' as const, onClick } : {})}
            className="flex w-full items-center gap-2 text-left"
        >
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
        </Root>
    );
};
