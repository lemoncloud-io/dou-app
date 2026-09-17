import { useTranslation } from 'react-i18next';

import { Hash, PenLine, Settings, Star, StickyNote } from 'lucide-react';

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
    /** No messages yet — only then does the intro offer to write the first one. */
    isEmpty?: boolean;
    onToggleFavorite: () => void;
    /** Channels only — a DM has no settings of its own. */
    onOpenSettings?: () => void;
}

/** Shape shared by the actions under the intro. */
const INTRO_ACTION =
    'focus-ring tactile flex items-center gap-1.5 rounded-lg border border-hairline bg-background px-3 py-1.5 text-caption font-medium text-foreground transition-colors ease-tactile hover:bg-accent';
/** The one filled action, and only on an empty channel: writing is what it is for. */
const INTRO_PRIMARY = 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90';

const focusComposer = () => document.querySelector<HTMLElement>('[data-composer-input]')?.focus();

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
    isEmpty = false,
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
                        className="rounded-2xl text-headline font-semibold"
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
                <h2 className="text-display text-foreground">{kind === 'channel' ? `#${name}` : name}</h2>
                <p className="max-w-prose text-body text-label">
                    {kind === 'channel' && t('chat.intro.channel', { name })}
                    {kind === 'dm' && t('chat.intro.dm', { name })}
                    {kind === 'self' && t('chat.intro.self')}
                </p>
                {description && (
                    <p className="max-w-prose whitespace-pre-line text-callout text-muted-foreground">{description}</p>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {/* The empty channel's first screen had no path to the one thing it is
                    for. This hands focus to the composer below. Once the channel has
                    messages the intro stays as a header, but the filled CTA goes: it
                    outranked the conversation and said something untrue about it. */}
                {isEmpty && (
                    <button type="button" onClick={focusComposer} className={cn(INTRO_ACTION, INTRO_PRIMARY)}>
                        <PenLine size={15} aria-hidden />
                        {t('chat.intro.writeFirst')}
                    </button>
                )}
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
