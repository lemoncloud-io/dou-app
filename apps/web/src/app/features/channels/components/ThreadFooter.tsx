import { useTranslation } from 'react-i18next';

import { DefaultAvatar, ImageAvatar, ThreadSummary } from '@chatic/web-ui-kit';

import type { ThreadMeta } from '../utils/buildThread';
import { lastChatPreview } from '../utils/lastChatPreview';

const MAX_REPLIER_AVATARS = 2;

interface ThreadFooterProps {
    meta: ThreadMeta;
    unseenCount: number;
    mentionsMe?: boolean;
    nameOf?: (userId: string) => string;
    onOpen: () => void;
    avatarOf?: (userId: string) => string | undefined;
    formatTime?: (date: Date) => string;
    align?: 'start' | 'end';
}

export const ThreadFooter = ({
    meta,
    unseenCount,
    mentionsMe,
    nameOf,
    onOpen,
    avatarOf,
    formatTime,
    align = 'start',
}: ThreadFooterProps) => {
    const { t } = useTranslation();

    const avatars = meta.repliers.slice(0, MAX_REPLIER_AVATARS).map(replier => {
        const src = avatarOf?.(replier.id) ?? replier.thumbnail;
        return src ? (
            <ImageAvatar key={replier.id} src={src} alt="" size={20} className="ring-1 ring-background" />
        ) : (
            <DefaultAvatar key={replier.id} size={20} className="ring-1 ring-background" />
        );
    });

    const last = meta.lastReply;
    const lastText = last ? lastChatPreview({ ...last, parentId: undefined }, t) : '';
    const lastName = last?.ownerId ? nameOf?.(last.ownerId) : undefined;
    const preview =
        unseenCount > 0 && lastText
            ? lastName
                ? t('chat.thread.lastReply', { name: lastName, text: lastText })
                : lastText
            : undefined;

    return (
        <ThreadSummary
            avatars={avatars}
            replyLabel={t('chat.thread.replyCount', { count: meta.count })}
            newReplyLabel={unseenCount > 0 ? t('chat.thread.newReplyCount', { count: unseenCount }) : undefined}
            mentionLabel={unseenCount > 0 && mentionsMe ? t('chat.thread.mentionsMe') : undefined}
            preview={preview}
            time={meta.lastReplyAt ? formatTime?.(new Date(meta.lastReplyAt)) : undefined}
            align={align}
            onClick={onOpen}
            aria-label={t('chat.thread.openThread', { count: meta.count })}
        />
    );
};
