import { useTranslation } from 'react-i18next';

import { DefaultAvatar, ImageAvatar, ThreadSummary } from '@chatic/web-ui-kit';

import type { ThreadMeta } from '../utils/buildThread';

// The avatar stack answers "who is in there" at a glance; past a few faces it stops
// adding information and starts costing row height. Five is what the design's stack
// holds before it switches to a `+N` counter (Figma 4703:43719).
const MAX_REPLIER_AVATARS = 5;

interface ThreadFooterProps {
    meta: ThreadMeta;
    /**
     * How many replies the viewer has not seen (0 = none). Replies are `stereo:'user'` so
     * they count toward the channel's unread badge but never appear in the main feed —
     * without this hint the badge clears on entry and the replies go unseen (ADR-0045).
     * Computed by the room, which owns the read baseline (see `countUnseenReplies`).
     */
    unseenCount: number;
    onOpen: () => void;
    /**
     * Resolves a replier's avatar from the caller's profile/member caches. Takes
     * precedence over `meta.repliers[].thumbnail`, which is whatever the reply row
     * embedded — see the note in the component doc.
     */
    avatarOf?: (userId: string) => string | undefined;
    /** Formats the last reply's clock time — the room owns the locale's 12/24h form. */
    formatTime?: (date: Date) => string;
    /** Mirrors the row for my own (right-aligned) messages. */
    align?: 'start' | 'end';
}

/**
 * The reply footer under a thread root: replier avatars, reply count, an unseen-reply
 * count and the last reply's time. Tapping it opens the full-screen thread route.
 * Rendered only when the root has ≥1 loaded reply — the count is best-effort (bounded
 * by the loaded cache, ADR-0008), so it is presented as a plain affordance, never as an
 * authoritative total.
 *
 * Avatars resolve through `avatarOf` first and fall back to the embedded `owner$`
 * thumbnail `buildThreadIndex` carried over. That order matters twice: message rows
 * prefer the site profile too, so without it the same person wears two different faces
 * one line apart; and an optimistic reply has no `owner$` at all, so the embed alone
 * leaves a just-posted reply faceless. The precedence lives here rather than in
 * `buildThreadIndex` to keep that derivation pure — it must not know about caches
 * (ADR-0047 decision 5).
 *
 * The unseen state reads "새 댓글 N개" rather than the bare dot it used to be: by the
 * time a row is worth interrupting for, how much is new is the fact worth showing. The
 * count is the loaded window's, like every other number here.
 */
export const ThreadFooter = ({
    meta,
    unseenCount,
    onOpen,
    avatarOf,
    formatTime,
    align = 'start',
}: ThreadFooterProps) => {
    const { t } = useTranslation();

    const avatars = meta.repliers.slice(0, MAX_REPLIER_AVATARS).map(replier => {
        const src = avatarOf?.(replier.id) ?? replier.thumbnail;
        // `ring-background`, not a plain border: the faces overlap, so each needs to punch a
        // hole in the one behind it in whatever color the row actually sits on.
        return src ? (
            <ImageAvatar key={replier.id} src={src} alt="" size={20} className="ring-1 ring-background" />
        ) : (
            <DefaultAvatar key={replier.id} size={20} className="ring-1 ring-background" />
        );
    });

    return (
        <ThreadSummary
            avatars={avatars}
            overflowCount={Math.max(0, meta.repliers.length - MAX_REPLIER_AVATARS)}
            replyLabel={t('chat.thread.replyCount', { count: meta.count })}
            newReplyLabel={unseenCount > 0 ? t('chat.thread.newReplyCount', { count: unseenCount }) : undefined}
            time={meta.lastReplyAt ? formatTime?.(new Date(meta.lastReplyAt)) : undefined}
            align={align}
            onClick={onOpen}
            aria-label={t('chat.thread.openThread', { count: meta.count })}
        />
    );
};
