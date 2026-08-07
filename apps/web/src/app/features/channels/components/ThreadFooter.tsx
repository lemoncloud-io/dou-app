import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { DefaultAvatar, ImageAvatar } from '@chatic/web-ui-kit';

import type { ThreadMeta } from '../utils/buildThread';

// The avatar stack answers "who is in there" at a glance; past a few faces it stops
// adding information and starts costing row height.
const MAX_REPLIER_AVATARS = 3;

interface ThreadFooterProps {
    meta: ThreadMeta;
    /**
     * Replies newer than my read cursor exist. Replies are `stereo:'user'` so they
     * count toward the channel's unread badge but never appear in the main feed —
     * without this hint the badge clears on entry and the replies go unseen (ADR-0045).
     */
    hasUnseen: boolean;
    onOpen: () => void;
    /**
     * Resolves a replier's avatar from the caller's profile/member caches. Takes
     * precedence over `meta.repliers[].thumbnail`, which is whatever the reply row
     * embedded — see the note in the component doc.
     */
    avatarOf?: (userId: string) => string | undefined;
}

/**
 * The reply footer under a thread root: replier avatars + reply count + an unseen dot.
 * Tapping it opens the full-screen thread route. Rendered only when the root has ≥1
 * loaded reply — the count is best-effort (bounded by the loaded cache, ADR-0008), so
 * it is presented as a plain affordance, never as an authoritative total.
 *
 * Avatars resolve through `avatarOf` first and fall back to the embedded `owner$`
 * thumbnail `buildThreadIndex` carried over. That order matters twice: message rows
 * prefer the site profile too, so without it the same person wears two different faces
 * one line apart; and an optimistic reply has no `owner$` at all, so the embed alone
 * leaves a just-posted reply faceless. The precedence lives here rather than in
 * `buildThreadIndex` to keep that derivation pure — it must not know about caches
 * (ADR-0047 decision 5).
 */
export const ThreadFooter = ({ meta, hasUnseen, onOpen, avatarOf }: ThreadFooterProps) => {
    const { t } = useTranslation();

    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={t('chat.thread.openThread', { count: meta.count })}
            className="flex h-7 w-fit max-w-full items-center gap-1.5 rounded-full py-0.5 pr-2 text-xs text-primary active:opacity-70"
        >
            {meta.repliers.length > 0 && (
                <span className="flex shrink-0 items-center -space-x-1">
                    {meta.repliers.slice(0, MAX_REPLIER_AVATARS).map(replier => {
                        const src = avatarOf?.(replier.id) ?? replier.thumbnail;
                        return src ? (
                            <ImageAvatar
                                key={replier.id}
                                src={src}
                                alt=""
                                size={16}
                                className="ring-1 ring-background"
                            />
                        ) : (
                            <DefaultAvatar key={replier.id} size={16} className="ring-1 ring-background" />
                        );
                    })}
                </span>
            )}
            <span className={cn('font-semibold tabular-nums', hasUnseen && 'text-primary')}>
                {t('chat.thread.replyCount', { count: meta.count })}
            </span>
            {hasUnseen && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />}
        </button>
    );
};
