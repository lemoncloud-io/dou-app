import { useTranslation } from 'react-i18next';

import type { ChannelMember } from '../hooks';
import { AvatarRowsSkeleton } from './AvatarRowsSkeleton';
import { MemberRow } from './MemberRow';

interface MemberListProps {
    members: ChannelMember[];
    isLoading: boolean;
    error: Error | null;
    /** Current user id — drives the "me" badge and hides self-kick. */
    myUid: string | null;
    /** Whether the current user can remove (kick) other members (owner only). */
    canKick: boolean;
    onKick: (userId: string) => void;
}

export const MemberList = ({ members, isLoading, error, myUid, canKick, onKick }: MemberListProps) => {
    const { t } = useTranslation();

    if (isLoading) {
        return <AvatarRowsSkeleton label="Loading members" />;
    }

    if (error) {
        return <p className="px-2 py-2 text-callout text-destructive">{t('channels.members.failed')}</p>;
    }

    if (members.length === 0) {
        return <p className="px-2 py-2 text-callout text-muted-foreground">{t('channels.members.empty')}</p>;
    }

    return (
        <div className="flex flex-col gap-0.5">
            {members.map(member => (
                <MemberRow
                    key={member.id}
                    member={member}
                    isMe={member.id === myUid}
                    canKick={canKick}
                    onKick={onKick}
                />
            ))}
        </div>
    );
};
