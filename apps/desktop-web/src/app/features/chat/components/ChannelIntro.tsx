import { useTranslation } from 'react-i18next';

import { Hash, Settings, Star, StickyNote } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import { avatarStyle } from '../../../shared';

interface ChannelIntroProps {
    kind: 'channel' | 'dm' | 'self';
    /** What the header calls it: the channel name, the other person, or "You". */
    name: string;
    description?: string;
    /** DM only: the other person's picture and color seed. */
    avatar?: string;
    colorSeed?: string;
    isFavorite: boolean;
    onToggleFavorite: () => void;
    /** Channels only — a DM has no settings of its own. */
    onOpenSettings?: () => void;
}

/** Shape shared by the two quiet actions under the intro. */
const INTRO_ACTION =
    'focus-ring tactile flex items-center gap-1.5 rounded-lg border border-hairline bg-background px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors ease-tactile hover:bg-accent';

/**
 * The top of a conversation once its whole history is loaded (Slack's "This is the very
 * beginning of #…"). It answers "where am I and is there more above?" — a feed that simply
 * stops at its oldest message leaves both open — and it is the empty channel's first screen.
 */
export const ChannelIntro = ({
    kind,
    name,
    description,
    avatar,
    colorSeed,
    isFavorite,
    onToggleFavorite,
    onOpenSettings,
}: ChannelIntroProps) => {
    const { t } = useTranslation();
    return (
        <section aria-label={t('chat.intro.label')} className="flex flex-col items-start gap-3 pb-6 pt-8">
            {kind === 'dm' ? (
                <Avatar className="h-14 w-14 rounded-2xl">
                    {avatar && <AvatarImage src={avatar} alt="" className="rounded-2xl" />}
                    <AvatarFallback
                        className="rounded-2xl text-[22px] font-semibold"
                        style={avatarStyle(colorSeed ?? name)}
                    >
                        {name.charAt(0).toUpperCase() || '?'}
                    </AvatarFallback>
                </Avatar>
            ) : (
                <span
                    aria-hidden
                    className={cn(
                        'flex h-14 w-14 items-center justify-center rounded-2xl',
                        kind === 'self' ? 'bg-muted text-label' : 'bg-primary/15 text-primary-ink'
                    )}
                >
                    {kind === 'self' ? <StickyNote size={26} /> : <Hash size={26} strokeWidth={2.25} />}
                </span>
            )}
            <div className="flex flex-col gap-1">
                <h2 className="text-[24px] font-bold leading-tight tracking-[-0.02em] text-foreground">
                    {kind === 'channel' ? `#${name}` : name}
                </h2>
                <p className="max-w-prose text-[15px] leading-relaxed text-label">
                    {kind === 'channel' && t('chat.intro.channel', { name })}
                    {kind === 'dm' && t('chat.intro.dm', { name })}
                    {kind === 'self' && t('chat.intro.self')}
                </p>
                {description && (
                    <p className="max-w-prose whitespace-pre-line text-[14px] leading-relaxed text-muted-foreground">
                        {description}
                    </p>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={onToggleFavorite} aria-pressed={isFavorite} className={INTRO_ACTION}>
                    <Star size={15} aria-hidden className={cn(isFavorite && 'fill-favorite text-favorite')} />
                    {t(isFavorite ? 'chat.header.unfavorite' : 'chat.header.favorite')}
                </button>
                {onOpenSettings && (
                    <button type="button" onClick={onOpenSettings} className={INTRO_ACTION}>
                        <Settings size={15} aria-hidden />
                        {t('chat.header.settings')}
                    </button>
                )}
            </div>
        </section>
    );
};
