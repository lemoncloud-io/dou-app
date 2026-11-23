import { useTranslation } from 'react-i18next';

import { Hash, PenLine, Settings, Star, StickyNote, UserPlus } from 'lucide-react';

import { cn } from '@chatic/ui-kit';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import { avatarStyle, focusComposer } from '../../../shared';

interface ChannelIntroProps {
    kind: 'channel' | 'dm' | 'self';
    name: string;
    description?: string;
    avatar?: string;
    colorSeed?: string;
    isFavorite: boolean;
    isEmpty?: boolean;
    onToggleFavorite: () => void;
    onOpenSettings?: () => void;
    onAddMembers?: () => void;
}

const INTRO_ACTION =
    'focus-ring tactile flex items-center gap-1.5 rounded-lg border border-hairline bg-background px-3 py-1.5 text-caption font-medium text-foreground transition-colors ease-tactile hover:bg-accent';
const INTRO_PRIMARY = 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90';

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
    onAddMembers,
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
                    className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-label"
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
                {isEmpty && onAddMembers && (
                    <button type="button" onClick={onAddMembers} className={INTRO_ACTION}>
                        <UserPlus size={15} aria-hidden />
                        {t('channels.addMembers.open')}
                    </button>
                )}
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
