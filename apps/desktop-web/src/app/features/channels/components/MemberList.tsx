import { useTranslation } from 'react-i18next';

import type { ChannelMember } from '../hooks';
import { AvatarRowsSkeleton } from './AvatarRowsSkeleton';
import { MemberRow } from './MemberRow';

interface MemberListProps {
    members: ChannelMember[];
    isLoading: boolean;
    error: Error | null;
    /** A failed incremental sync: the roster above may be stale. Shown inline, never hiding it. */
    syncError: Error | null;
    /** Re-runs the member loads behind both error states; omit to render them without retry. */
    onRetry?: () => void;
    /** Current user id — drives the "me" badge and hides self-kick. */
    myUid: string | null;
    /** Whether the current user can remove (kick) other members (owner only). */
    canKick: boolean;
    onKick: (userId: string) => void;
}

export const MemberList = ({
    members,
    isLoading,
    error,
    syncError,
    onRetry,
    myUid,
    canKick,
    onKick,
}: MemberListProps) => {
    const { t } = useTranslation();

    if (isLoading) {
        return <AvatarRowsSkeleton label={t('channels.members.loading')} />;
    }

    if (error) {
        return (
            <div className="flex flex-col items-start gap-2 px-2 py-2">
                <p className="text-callout text-destructive">{t('channels.members.failed')}</p>
                {onRetry && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="focus-ring tactile rounded-lg bg-muted px-3 py-1.5 text-callout font-medium text-foreground transition-colors hover:bg-accent"
                    >
                        {t('chat.retry')}
                    </button>
                )}
            </div>
        );
    }

    if (members.length === 0) {
        return <p className="px-2 py-2 text-callout text-muted-foreground">{t('channels.members.empty')}</p>;
    }

    return (
        <div className="flex flex-col gap-0.5">
            {syncError && (
                <div className="flex items-center gap-2 px-2 py-1.5">
                    <p className="flex-1 text-caption text-muted-foreground">{t('channels.members.stale')}</p>
                    {onRetry && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="focus-ring tactile shrink-0 rounded-md px-2 py-1 text-caption font-medium text-foreground transition-colors hover:bg-accent"
                        >
                            {t('chat.retry')}
                        </button>
                    )}
                </div>
            )}
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
